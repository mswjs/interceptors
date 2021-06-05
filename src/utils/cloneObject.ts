function isPlainObject(obj?: Record<string, any>): boolean {
  if (typeof obj === 'undefined') {
    return false
  }

  return obj.constructor.name === 'Object'
}

export function cloneObject<ObjectType extends Record<string, any>>(
  obj: ObjectType
): ObjectType {
  const enumerableProperties = Object.entries(obj).reduce<Record<string, any>>(
    (acc, [key, value]) => {
      // Recursively clone only plain objects, omitting class instances.
      acc[key] = isPlainObject(value) ? cloneObject(value) : value
      return acc
    },
    {}
  )

  return isPlainObject(obj)
    ? enumerableProperties
    : Object.assign(Object.getPrototypeOf(obj), enumerableProperties)
}
