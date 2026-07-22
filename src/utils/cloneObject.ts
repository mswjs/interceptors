import { createLogger } from './logger'

const logger = createLogger('clone-object')

function isPlainObject(obj?: Record<string, any>): boolean {
  logger.verbose('is plain object? %o', obj)

  if (obj == null || !obj.constructor?.name) {
    logger.verbose('given object is undefined, not a plain object')
    return false
  }

  logger.verbose('checking object constructor: %s', obj.constructor.name)
  return obj.constructor.name === 'Object'
}

export function cloneObject<ObjectType extends Record<string, any>>(
  obj: ObjectType
): ObjectType {
  logger.verbose('cloning object %o', obj)

  const enumerableProperties = Object.entries(obj).reduce<Record<string, any>>(
    (acc, [key, value]) => {
      logger.verbose('analyzing key-value pair: %s %o', key, value)

      // Recursively clone only plain objects, omitting class instances.
      acc[key] = isPlainObject(value) ? cloneObject(value) : value
      return acc
    },
    {}
  )

  return isPlainObject(obj)
    ? (enumerableProperties as ObjectType)
    : Object.assign(Object.getPrototypeOf(obj), enumerableProperties)
}
