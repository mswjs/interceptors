import net from 'node:net'
import { toBuffer } from '../../utils/bufferUtils'
import { createLogger } from '../../utils/logger'

const kListenerWrap = Symbol('kListenerWrap')
export const kMockState = Symbol('kMockState')

const log = createLogger('MockSocket')

export class MockSocket extends net.Socket {
  static PENDING = 0 as const
  static MOCKED = 1 as const
  static PASSTHROUGH = 2 as const

  private [kMockState]: 0 | 1 | 2

  public connecting: boolean

  constructor(options: net.SocketConstructorOpts) {
    super(options)

    this[kMockState] = 0

    /**
     * @note Start the socket in the connecting state.
     * This will make Node.js buffer any writes to it automatically.
     */
    this.connecting = true

    log('constructed new instance')
  }

  _read(size: number): void {
    log('read', size)
  }

  /**
   * Override "_writeGeneric" to benefit from built-in chunk buffering in Node.js.
   * That's also the baseline method for both "write" and "writev".
   * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L994
   */
  _writeGeneric(
    writev: boolean,
    data: Array<any> | any,
    encoding: BufferEncoding,
    callback?: ((error?: Error | null) => void) | undefined
  ): void {
    log({ connecting: this.connecting, data, encoding, callback }, 'write')

    const emitWrite = () => {
      if (Array.isArray(data)) {
        for (const entry of data) {
          this.emit('internal:write', entry.chunk, entry.encoding)
        }
      } else {
        this.emit('internal:write', data, encoding)
      }
    }

    // While connecting, the socket is in ambiguous state.
    // Buffer the writes using Node's existing buffering logic.
    if (this.connecting) {
      super._writeGeneric(writev, data, encoding, callback)
      emitWrite()
      return
    }

    if (this[kMockState] === MockSocket.MOCKED) {
      /**
       * Handle "_writeGeneric" calls scheduled after the "connect" event.
       * These are writes performed while connecting, and for the mocked socket
       * they must be ignored. There's nowhere to flush them. Calling "_writeGeneric"
       * past this point will result in "Error: write EBADF".
       * @see https://github.com/nodejs/node/blob/main/deps/uv/src/unix/stream.c#L1304-L1305
       */
      if (this._pendingData) {
        log(this._pendingData, 'mocked connection, clearing write buffer')

        this._pendingData = null
        this._pendingEncoding = null
        return
      }

      emitWrite()
      return
    }

    super._writeGeneric(writev, data, encoding, callback)
  }

  /**
   * Create a proxy `net.Socket` instance that represents the intercepted socket server-side.
   * This is the reference exposed as `socket` in the connection listener. This proxy allows
   * the user to interact with `socket` from the server's perspective (e.g. `socket.write()`
   * on the server translates to the `socket.push()` on the client).
   */
  public createServerSocket(): net.Socket {
    return new Proxy(this, {
      get: (target, property, receiver) => {
        const getRealValue = () => {
          return Reflect.get(target, property, receiver)
        }

        if (property === 'on' || property === 'addListener') {
          const realAddListener = getRealValue() as net.Socket['addListener']

          return (event: any, listener: (...args: Array<unknown>) => void) => {
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

        // Push data to the client socket when server "socket.write()" is called.
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
