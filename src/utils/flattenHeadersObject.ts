export const flattenHeadersObject = (
  headers: Record<string, string | string[]>
): Record<string, string> => {
  return Object.entries(headers).reduce<Record<string, string>>(
    (acc, [name, value]) => {
      acc[name] = ([] as string[]).concat(value).join('; ')
      return acc
    },
    {}
  )
}
