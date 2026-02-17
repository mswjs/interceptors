import { AsyncLocalStorage } from 'node:async_hooks'
import { invariant } from 'outvariant'
import { get } from 'es-toolkit/compat'

const nestedInvocationContext = new AsyncLocalStorage<boolean | undefined>()

type ObjectRecordEntry<T extends object> =
  | {
      type: 'apply'
      path: Array<string | symbol>
      metadata: {
        method: string | symbol
        args: Array<unknown>
      }
      replay: (nextTarget: T) => void
    }
  | {
      type: 'set'
      path: Array<string | symbol>
      metadata: {
        property: string | symbol
        descriptor: PropertyDescriptor
      }
      replay: (nextTarget: T) => void
    }
  | {
      type: 'delete'
      path: Array<string | symbol>
      metadata: {
        property: string | symbol
      }
      replay: (nextTarget: T) => void
    }

interface ObjectRecorderOptions<T extends object> {
  filter: (entry: ObjectRecordEntry<T>) => boolean
}

export class ObjectRecorder<T extends object> {
  static IDLE = 1 as const
  static RECORDING = 2 as const
  static PAUSED = 3 as const
  static DISPOSED = 4 as const

  #entries: Array<ObjectRecordEntry<T>>

  public proxy: T
  public readyState: 1 | 2 | 3 | 4

  constructor(
    protected readonly target: T,
    protected readonly options?: ObjectRecorderOptions<T>
  ) {
    this.#entries = []

    this.readyState = ObjectRecorder.IDLE
    this.proxy = target
  }

  public get entries(): Array<ObjectRecordEntry<T>> {
    return this.#entries
  }

  public start(): void {
    invariant(
      this.readyState !== ObjectRecorder.DISPOSED,
      'Failed to start recording: recorder is disposed'
    )

    invariant(
      this.readyState === ObjectRecorder.IDLE,
      'Failed to start recording: recording already in progress'
    )

    this.readyState = ObjectRecorder.RECORDING

    const wrapInProxy = <V extends object>(
      target: V,
      parentPath: Array<string | symbol>
    ) => {
      return new Proxy<V>(target, {
        get: (target, property, receiver) => {
          const value = target[property as keyof V]

          if (typeof value === 'function') {
            return new Proxy(value, {
              apply: (fn, thisArg, args) => {
                const defaultApply = () => {
                  return fn.apply(thisArg, args)
                }

                const entry: ObjectRecordEntry<T> = {
                  type: 'apply',
                  path: parentPath,
                  metadata: {
                    method: property,
                    args,
                  },
                  replay(nextTarget) {
                    const nextTargetValue = Reflect.get(nextTarget, property)

                    if (typeof nextTargetValue !== 'function') {
                      return
                    }

                    Reflect.apply(nextTargetValue, nextTarget, args)
                  },
                }

                this.#addEntry(entry)
                return nestedInvocationContext.run(true, defaultApply)
              },
            })
          }

          if (value != null && typeof value === 'object') {
            return wrapInProxy(value, parentPath.concat(property))
          }

          return Reflect.get(target, property, receiver)
        },
        defineProperty: (target, property, descriptor) => {
          const defaultDefineProperty = () => {
            return Reflect.defineProperty(target, property, descriptor)
          }

          // Prevent recording changes caused by method invocations.
          // Replaying the method must be enough to reapply them, too.
          if (nestedInvocationContext.getStore()) {
            return defaultDefineProperty()
          }

          const entry: ObjectRecordEntry<T> = {
            type: 'set',
            path: parentPath,
            metadata: {
              property,
              descriptor,
            },
            replay(nextTarget) {
              Reflect.defineProperty(nextTarget, property, descriptor)
            },
          }

          this.#addEntry(entry)
          return defaultDefineProperty()
        },
        deleteProperty: (target, property) => {
          const defaultDeleteProperty = () => {
            return Reflect.deleteProperty(target, property)
          }

          // Prevent recording changes caused by method invocations.
          // Replaying the method must be enough to reapply them, too.
          if (nestedInvocationContext.getStore()) {
            return defaultDeleteProperty()
          }

          const entry: ObjectRecordEntry<T> = {
            type: 'delete',
            path: parentPath,
            metadata: {
              property,
            },
            replay(nextTarget) {
              Reflect.deleteProperty(nextTarget, property)
            },
          }

          this.#addEntry(entry)
          return defaultDeleteProperty()
        },
      })
    }

    this.proxy = wrapInProxy(this.target, [])
  }

  public replay(nextTarget: T): void {
    for (const entry of this.#entries) {
      entry.replay(
        entry.path.length > 0 ? get(nextTarget, entry.path) : nextTarget
      )
    }
  }

  /**
   * Pause the recording.
   * Any changes applied while the recording is paused will not be recorded.
   */
  public pause(): void {
    invariant(
      this.readyState !== ObjectRecorder.DISPOSED,
      'Failed to pause the recorder: recorder is disposed'
    )

    invariant(
      this.readyState === ObjectRecorder.RECORDING,
      'Failed to pause the recorder: recorder is not running'
    )

    this.readyState = ObjectRecorder.PAUSED
  }

  /**
   * Resume the recording.
   */
  public resume(): void {
    invariant(
      this.readyState !== ObjectRecorder.DISPOSED,
      'Failed to resume the recorder: recorder is disposed'
    )

    invariant(
      this.readyState === ObjectRecorder.PAUSED,
      'Failed to resume the recorder: recorder is not paused'
    )

    this.readyState = ObjectRecorder.RECORDING
  }

  /**
   * Pause the recording and execute the given callback.
   * Any mutations applied within the callback will not be recorded.
   */
  public runQuietly(callback: () => Promise<void> | void): void {
    invariant(
      this.readyState !== ObjectRecorder.DISPOSED,
      'Failed to run action quielty: recorder is disposed'
    )

    this.pause()

    try {
      const result = callback()

      if (result instanceof Promise) {
        result.finally(this.resume.bind(this))
      } else {
        this.resume()
      }
    } catch {
      this.resume()
    }
  }

  public dispose(): void {
    this.readyState = ObjectRecorder.DISPOSED
    this.#entries.length = 0
  }

  #addEntry(entry: ObjectRecordEntry<T>): void {
    invariant(
      this.readyState !== ObjectRecorder.IDLE,
      'Failed to add entry to the recorder: recorder is idle'
    )

    invariant(
      this.readyState !== ObjectRecorder.DISPOSED,
      'Failed to add entry to the recorder: recorder is disposed'
    )

    if (this.readyState === ObjectRecorder.PAUSED) {
      return
    }

    if (this.options?.filter(entry) ?? true) {
      this.#entries.push(entry)
    }
  }
}
