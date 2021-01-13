import { isObject } from './isObject'

export function cloneObject(obj: Record<string, any>) {
  return Object.entries(obj).reduce<Record<string, any>>(
    (acc, [key, value]) => {
      acc[key] = isObject(value) ? cloneObject(value) : value
      return acc
    },
    {}
  )
}
