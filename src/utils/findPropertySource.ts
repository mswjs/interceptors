export function findPropertySource(
  target: object,
  propertyName: string | symbol
): object | null {
  if (propertyName in target === false) return null

  const hasProperty = Object.prototype.hasOwnProperty.call(target, propertyName)
  if (hasProperty) return target

  const prototype = Reflect.getPrototypeOf(target)
  return prototype ? findPropertySource(prototype, propertyName) : null
}
