import { debug } from './debug'

const log = debug('cloneObject')

function isPlainObject(obj?: Record<string, any>): boolean {
  log('is plain object?', obj)

  if (obj == null || !obj.constructor?.name) {
    log('given object is undefined, not a plain object...')
    return false
  }

  log('checking the object constructor:', obj.constructor.name)
  return obj.constructor.name === 'Object'
}

export function cloneObject<ObjectType extends Record<string, any>>(
  obj: ObjectType
): ObjectType {
  log('cloning object:', obj)

  const enumerableProperties = Object.entries(obj).reduce<Record<string, any>>(
    (acc, [key, value]) => {
      log('analyzing key-value pair:', key, value)

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
