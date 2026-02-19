import net from 'node:net'
import { toBuffer } from '../../utils/bufferUtils'

const kListenerWrap = Symbol('kListenerWrap')

export class NewMockSocket extends net.Socket {
  _read(size: number): void {}

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    // Emit an internal event to translate client writes to server socket "data" events.
    // This might not be super elegant, but it doesn't require us to create new emitters.
    this.emit('internal:write', chunk, encoding)

    /**
     * @todo Check if the socket still buffers the write with this custom "_write".
     * Ideally, we can rely on the buffered writes so the socket flushes them on passthrough for us.
     */

    callback(null)
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
