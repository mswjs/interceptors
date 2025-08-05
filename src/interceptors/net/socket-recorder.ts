import net from 'node:net'

const kSocketRecorder = Symbol('kSocketRecorder')

export interface SocketRecorder<T extends net.Socket> {
  socket: T
  replay: (newSocket: net.Socket) => void
}

export interface SocketRecorderEntry {
  type: 'get' | 'set' | 'apply'
  metadata: Record<string, any>
  replay: (newSocket: net.Socket) => void
}

/**
 * Creates a proxy over the given mock `Socket` instance
 * that records all the property setters and methods calls
 * so they can later be replayed on the passthrough socket.
 */
export function createSocketRecorder<T extends net.Socket>(
  socket: T,
  options?: {
    onEntry?: (entry: SocketRecorderEntry) => boolean | void
    resolveGetterValue?: (
      target: any,
      property: string | symbol,
      receiver: any
    ) => void
  }
): SocketRecorder<T> {
  const entries: Array<SocketRecorderEntry> = []

  Object.defineProperty(socket, kSocketRecorder, {
    value: entries,
    configurable: true,
    enumerable: false,
  })

  const addEntry = (entry: SocketRecorderEntry) => {
    if (options?.onEntry?.(entry) !== false) {
      entries.push(entry)
    }
  }

  const proxy = new Proxy(socket, {
    get(target, property, receiver) {
      if (
        typeof property === 'string' &&
        !property.startsWith('_') &&
        typeof target[property as keyof T] === 'function'
      ) {
        return new Proxy(target[property as keyof T] as Function, {
          apply(target, thisArg, argArray) {
            if (target.name === 'destroy') {
              entries.length = 0
            }

            if (target.name !== 'push') {
              addEntry({
                type: 'apply',
                metadata: { property },
                replay(newSocket) {
                  Reflect.apply(target, newSocket, argArray)
                },
              })
            }
            return Reflect.apply(target, thisArg, argArray)
          },
        })
      }

      return (
        options?.resolveGetterValue?.(target, property, receiver) ??
        Reflect.get(target, property, receiver)
      )
    },
    set(target, property, newValue, receiver) {
      const defaultSetter = () => {
        return Reflect.set(target, property, newValue, receiver)
      }

      if (typeof property === 'symbol') {
        return defaultSetter()
      }

      const attributes = Object.getOwnPropertyDescriptor(target, property)
      if (attributes == null || !attributes.writable) {
        return defaultSetter()
      }

      addEntry({
        type: 'set',
        metadata: { property, newValue },
        replay(newSocket) {
          Reflect.set(newSocket, property, newValue, newSocket)
        },
      })

      return defaultSetter()
    },
  })

  return {
    socket: proxy,
    replay(newSocket) {
      for (const entry of entries) {
        entry.replay(newSocket)
      }
      entries.length = 0
    },
  }
}

export function inspectSocketRecorder<T extends net.Socket>(
  socket: net.Socket
): SocketRecorder<T> | undefined {
  return Reflect.get(socket, kSocketRecorder) as SocketRecorder<T>
}
