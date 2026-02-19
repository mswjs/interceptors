import net from 'node:net'
import { toBuffer } from '../../utils/bufferUtils'

type ErrorStatus = 0 | 1

declare module 'node:net' {
  interface Socket {
    _handle: {
      open: (fd: unknown) => ErrorStatus
      connect: (request: TcpWrap, address: string, port: number) => void
      listen: (backlog: number) => ErrorStatus
      onconnection?: () => void
      getpeername?: () => ErrorStatus
      getsockname?: () => ErrorStatus
      reading: boolean
      onread: () => {}
      readStart: () => void
      readStop: () => void
      bytesRead: number
      bytesWritten: number
      ref?: () => void
      unref?: () => void
      fchmod: (mode: number) => void
      setBlocking: (blocking: boolean) => ErrorStatus
      setNoDelay?: (noDelay: boolean) => void
      setKeepAlive?: (keepAlive: boolean, initialDelay: number) => void
      shutdown: (reqest: unknown /* ShutdownWrap */) => ErrorStatus
      close: () => void
    }
  }
}

interface TcpWrap {
  oncomplete: (
    status: ErrorStatus,
    owner: any,
    request: TcpWrap,
    readable?: boolean,
    writable?: boolean
  ) => void
}

const kListenerWrap = Symbol('kListenerWrap')

export class NewMockSocket extends net.Socket {
  /**
   * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1281
   */
  public connect(...args: [any, any]): this {
    this.on('connectionAttempt', () => {
      // Patch the TCPWrap handle set only after the connection attempt.
      this._handle.connect = (tcpWrap, address, port) => {
        /**
         * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1649
         */
        tcpWrap.oncomplete(0, this._handle, tcpWrap, true, true)
      }
    })

    return super.connect(...args)
  }

  _read(size: number): void {}

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    // Emit an internal event to translate client writes to server socket "data" events.
    // This might not be super elegant, but it doesn't require us to create new emitters.
    this.emit('internal:write', chunk, encoding)

    callback(null)
  }

  /**
   * Establish this socket connection as-is.
   */
  public passthrough(): void {
    throw new Error('Passthough not implemented')
  }

  public createServerSocket(): net.Socket {
    return new Proxy(this, {
      get: (target, property, receiver) => {
        const getRealValue = () => {
          return Reflect.get(target, property, receiver)
        }

        if (property === 'on' || property === 'addListener') {
          const realAddListener = getRealValue() as net.Socket['addListener']

          return (
            event: string,
            listener: (...args: Array<unknown>) => void
          ) => {
            if (event === 'data') {
              const listenerWrap = (chunk: any, encoding?: BufferEncoding) => {
                listener(toBuffer(chunk, encoding))
              }

              Object.defineProperty(listener, kListenerWrap, {
                enumerable: false,
                writable: false,
                value: listenerWrap,
              })

              this.on('internal:write', listenerWrap)

              return target
            }

            return realAddListener.call(target, event, listener)
          }
        }

        if (property === 'off' || property === 'removeListener') {
          const realRemoveListener =
            getRealValue() as net.Socket['removeListener']

          return (event: string, listener: any) => {
            if (event === 'data') {
              const listenerWrap = listener[kListenerWrap]

              if (listenerWrap) {
                return realRemoveListener.call(target, event, listenerWrap)
              }
            }

            return realRemoveListener.call(target, event, listener)
          }
        }

        // Push data to the client socket when "server.write()" is called.
        if (property === 'write') {
          return (
            chunk: any,
            encoding: BufferEncoding,
            callback: (error?: Error | null) => void
          ) => {
            this.push(toBuffer(chunk, encoding), encoding)
          }
        }

        return getRealValue()
      },
    })
  }
}
