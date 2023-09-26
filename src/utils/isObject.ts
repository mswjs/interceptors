/**
 * Determines if a given value is an instance of object.
 */
export function isObject<T>(value: any): value is T {
  return Object.prototype.toString.call(value) === '[object Object]'
}
