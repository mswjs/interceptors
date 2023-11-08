export function isPropertyAccessible<Obj extends Record<string, any>>(
  obj: Obj,
  key: keyof Obj
) {
  try {
    obj[key]
    return true
  } catch {
    return false
  }
}
