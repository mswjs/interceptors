import { invariant } from 'outvariant'

class GlobalsRegistry {
  #globals = new Map<keyof typeof globalThis, () => void>()

  public replaceGlobal<K extends keyof typeof globalThis>(
    key: K,
    nextValue: (typeof globalThis)[K]
  ): () => void {
    invariant(
      !this.#globals.has(key),
      `Failed to replace a global value at "${key}": already replaced.`
    )

    const match = getDeepPropertyDescriptor(globalThis, key)

    if (typeof match === 'undefined') {
      console.warn(
        `Failed to replace a global value at "${key}": not a global value.`
      )
      return () => {}
    }

    Object.defineProperty(globalThis, key, {
      value: nextValue,
      enumerable: true,
      configurable: true,
    })

    const restoreGlobal = () => {
      if (!this.#globals.has(key)) {
        return
      }

      if (match.owner === globalThis) {
        Object.defineProperty(match.owner, key, match.descriptor)
      } else {
        /**
         * @todo Delete the proxy property set by the registry.
         * If the owner isn't `globalThis`, the property is likely nested in the prototype.
         * The registry does not meddle with those, they are left intact.
         */
        Reflect.deleteProperty(globalThis, key)
      }

      this.#globals.delete(key)
    }

    this.#globals.set(key, restoreGlobal)

    return restoreGlobal
  }

  public restoreAllGlobals(): void {
    const errors: Array<Error> = []

    for (const [, restoreGlobal] of this.#globals) {
      try {
        restoreGlobal()
      } catch (error) {
        if (error instanceof Error) {
          errors.push(error)
        } else {
          throw error
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'FOO!')
    }
  }
}

export const globalsRegistry = new GlobalsRegistry()

interface DeepDescriptorMatch {
  owner: object
  descriptor: PropertyDescriptor
}

/**
 * Returns a property descriptor for the given property on the owner.
 * Walks down the prototype chain if the property does not exist on the owner.
 * Handy for getting a global property descriptor where `globalThis` is
 * replaced with a controlled class (e.g. ServiceWorkerGlobalScope).
 */
export function getDeepPropertyDescriptor<Owner extends object>(
  owner: Owner,
  key: keyof Owner
): DeepDescriptorMatch | undefined {
  let currentOwner: Owner | null = owner
  let descriptor: PropertyDescriptor | undefined

  while (currentOwner) {
    descriptor = Object.getOwnPropertyDescriptor(currentOwner, key)

    if (descriptor) {
      return {
        owner: currentOwner,
        descriptor,
      }
    }

    currentOwner = Object.getPrototypeOf(currentOwner)
  }
}
