import net from 'node:net'
import { toBuffer } from '../../utils/bufferUtils'

const kListenerWrap = Symbol('kListenerWrap')

export class MockSocket extends net.Socket {
  public connecting: boolean

  constructor(options: net.SocketConstructorOpts) {
    super(options)

    /**
     * @note Start the socket in the connecting state.
     * This will make Node.js buffer any writes to it automatically.
     * See the "_write" implementation below for more details.
     */
    this.connecting = true
  }

  _read(size: number): void {}

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    /**
     * Call "_writeGeneric" because it buffers any writes while the connection is pending.
     * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L994
     */
    super._writeGeneric(false, chunk, encoding, callback)

    // Emit an internal event to translate client writes to server socket "data" events.
    // This might not be super elegant, but it doesn't require us to create new emitters.
    this.emit('internal:write', chunk, encoding)
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
