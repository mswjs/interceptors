/**
 * Returns a boolean indicating whether the given global property
 * is defined and is configurable.
 */
export function hasConfigurableGlobal(
  propertyName: keyof typeof globalThis
): boolean {
  const descriptor = getDeepPropertyDescriptor(globalThis, propertyName)

  // The property is not set at all.
  if (typeof descriptor === 'undefined') {
    return false
  }

  // The property is set to a getter that returns undefined.
  if (
    typeof descriptor.get === 'function' &&
    typeof descriptor.get() === 'undefined'
  ) {
    return false
  }

  // The property is set to a value equal to undefined.
  if (typeof descriptor.get === 'undefined' && descriptor.value == null) {
    return false
  }

  if (typeof descriptor.set === 'undefined' && !descriptor.configurable) {
    console.error(
      `[MSW] Failed to apply interceptor: the global \`${propertyName}\` property is non-configurable. This is likely an issue with your environment. If you are using a framework, please open an issue about this in their repository.`
    )
    return false
  }

  return true
}

/**
 * Returns a property descriptor for the given property on the owner.
 * Walks down the prototype chain if the property does not exist on the owner.
 * Handy for getting a global property descriptor where `globalThis` is
 * replaced with a controlled class (e.g. ServiceWorkerGlobalScope).
 */
function getDeepPropertyDescriptor<Owner extends object>(
  owner: Owner,
  key: keyof Owner
): PropertyDescriptor | undefined {
  let currentOwner: Owner | null = owner
  let descriptor: PropertyDescriptor | undefined

  while (currentOwner) {
    descriptor = Object.getOwnPropertyDescriptor(currentOwner, key)

    if (descriptor) {
      return descriptor
    }

    currentOwner = Object.getPrototypeOf(currentOwner)
  }
}
