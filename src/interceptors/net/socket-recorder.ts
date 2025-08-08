import net from 'node:net'

const kSocketRecorder = Symbol('kSocketRecorder')

export interface SocketRecorder<T extends net.Socket> {
  socket: T
  replay: (newSocket: net.Socket) => void
  pause: () => void
  resume: () => void
}

export interface SocketRecorderEntry {
  type: 'get' | 'set' | 'apply'
  metadata: Record<string, any>
  replay: (newSocket: net.Socket) => void
}

/**
 * Allow certain internal setters to be recorded and replayed
 * because they aren't set in response to any action.
 * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/_http_client.js#L597
 */
const INTERNAL_SETTER_WHITELIST = ['_hadError']

function isInternalSetter(property: string): boolean {
  if (INTERNAL_SETTER_WHITELIST.includes(property)) {
    return false
  }

  return property.startsWith('_')
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
  let isPaused = false
  const entries: Array<SocketRecorderEntry> = []

  Object.defineProperty(socket, kSocketRecorder, {
    value: entries,
    configurable: true,
    enumerable: false,
  })

  const addEntry = (entry: SocketRecorderEntry) => {
    if (isPaused) {
      return
    }

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
          apply(fn, thisArg, args) {
            const defaultApply = () => fn.apply(thisArg, args)

            if (fn.name === 'destroy') {
              entries.length = 0
              return defaultApply()
            }

            /**
             * @note Ignore recording certain method calls.
             * - push, because pushing to the mock socket must never be replayed;
             * - once, because it's implemented by "on", resulting in both being recorded
             * and their listeners firing twice.
             */
            if (fn.name !== 'push' && fn.name !== 'once') {
              addEntry({
                type: 'apply',
                metadata: {
                  property,
                },
                replay(newSocket) {
                  Reflect.apply(
                    newSocket[property as keyof net.Socket] as Function,
                    newSocket,
                    args
                  )
                },
              })
            }

            return defaultApply()
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

      if (typeof property === 'symbol' || isInternalSetter(property)) {
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
    pause() {
      isPaused = true
    },
    resume() {
      isPaused = false
    },
  }
}

export function inspectSocketRecorder<T extends net.Socket>(
  socket: net.Socket
): SocketRecorder<T> | undefined {
  return Reflect.get(socket, kSocketRecorder) as SocketRecorder<T>
}
