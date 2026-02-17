import net from 'node:net'
import { ObjectRecorder } from './object-recorder'
import { MockSocket } from './mock-socket'
import {
  normalizeSocketWriteArgs,
  type WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'
import { toBuffer } from '../../utils/bufferUtils'

export const kSocketProxy = Symbol('kSocketProxy')
export const kClientSocket = Symbol('kClientSocket')
export const kServerSocket = Symbol('kServerSocket')

interface SocketControllerOptions {
  socket: MockSocket
  createConnection: () => net.Socket
}

export class SocketController {
  private [kSocketProxy]: net.Socket
  private [kClientSocket]: MockSocket
  private [kServerSocket]: MockSocket

  #recorder: ObjectRecorder<net.Socket>

  constructor(protected readonly options: SocketControllerOptions) {
    this[kClientSocket] = this.options.socket
    this[kServerSocket] = new MockSocket({})

    this.#recorder = new ObjectRecorder<net.Socket>(this.options.socket, {
      filter: (entry) => {
        if (entry.type === 'apply') {
          if (
            entry.metadata.method === 'write' ||
            entry.metadata.method === 'end'
          ) {
            const [chunk, encoding] = normalizeSocketWriteArgs(
              entry.metadata.args as WriteArgs
            )

            if (chunk) {
              // Translate client writes to the "data" event on the server socket.
              this[kServerSocket].emit('data', toBuffer(chunk, encoding))
            }
          }
        }

        return true
      },
    })
    this.#recorder.start()

    // When server writes, client receives data
    const originalServerWrite = this[kServerSocket].write.bind(
      this[kServerSocket]
    )
    const originalServerEnd = this[kServerSocket].end.bind(this[kServerSocket])

    this[kServerSocket].write = (...args: [any, any]) => {
      if (args[0] != null) {
        const [chunk, encoding] = normalizeSocketWriteArgs(args)

        this[kClientSocket].emit('data', toBuffer(chunk, encoding))
      }

      return originalServerWrite(...args)
    }

    this[kServerSocket].end = (...args: [any]) => {
      if (args[0] != null) {
        const [chunk, encoding] = normalizeSocketWriteArgs(args)

        this[kClientSocket].emit('data', toBuffer(chunk, encoding))
      }

      return originalServerEnd(...args)
    }

    this[kSocketProxy] = this.#recorder.proxy
  }

  /**
   * Mock the socket connection.
   */
  public connect(): void {
    this[kClientSocket].mockConnect()
    this[kServerSocket].mockConnect()
  }

  /**
   * Establish this socket connection as-is.
   */
  public passthrough(): net.Socket {
    this.#recorder.dispose()

    const realSocket = this.options.createConnection()
    this.#recorder.replay(realSocket)

    return realSocket
  }

  /**
   * Abort the underlying socket connection with the given reason.
   */
  public errorWith(reason?: Error): void {
    this[kClientSocket].destroy(reason)
  }
}
