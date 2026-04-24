import { invariant } from 'outvariant'

class GlobalsRegistry {
  #replacements = new Map<object, Map<PropertyKey, () => void>>()

  public replaceGlobal<Owner extends object, K extends keyof Owner>(
    owner: Owner,
    key: K,
    getNextValue: (realValue: Owner[K]) => Owner[K]
  ): () => void {
    const ownerReplacements = this.#replacements.get(owner)

    invariant(
      !ownerReplacements?.has(key),
      `Failed to replace a global value at "${String(key)}": already replaced.`
    )

    const match = getDeepPropertyDescriptor(owner, key)

    if (typeof match === 'undefined') {
      console.warn(
        `Failed to replace a global value at "${String(key)}": not a global value.`
      )
      return () => {}
    }

    Object.defineProperty(owner, key, {
      value: getNextValue(owner[key]),
      enumerable: true,
      configurable: true,
    })

    const restoreGlobal = () => {
      const currentReplacements = this.#replacements.get(owner)

      if (!currentReplacements?.has(key)) {
        return
      }

      if (match.owner === owner) {
        Object.defineProperty(match.owner, key, match.descriptor)
      } else {
        /**
         * @todo Delete the proxy property set by the registry.
         * If the owner isn't `globalThis`, the property is likely nested in the prototype.
         * The registry does not meddle with those, they are left intact.
         */
        Reflect.deleteProperty(owner, key)
      }

      currentReplacements.delete(key)

      if (currentReplacements.size === 0) {
        this.#replacements.delete(owner)
      }
    }

    if (ownerReplacements) {
      ownerReplacements.set(key, restoreGlobal)
    } else {
      this.#replacements.set(owner, new Map([[key, restoreGlobal]]))
    }

    return restoreGlobal
  }

  public restoreAllGlobals(): void {
    const errors: Array<Error> = []

    for (const [, ownerReplacements] of this.#replacements) {
      for (const [, restoreGlobal] of ownerReplacements) {
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
