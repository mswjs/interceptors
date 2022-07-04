/**
 * Determines if a given value is an instance of object.
 */
export function isObject(value: any): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}
