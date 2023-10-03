import { getValueBySymbol } from './getValueBySymbol'

type RawHeadersMap = Map<string, string>

/**
 * Returns raw headers from the given `Headers` instance.
 * @example
 * const headers = new Headers([
 *   ['X-HeadeR-NamE', 'Value']
 * ])
 * getRawFetchHeaders(headers)
 * // { 'X-HeadeR-NamE': 'Value' }
 */
export function getRawFetchHeaders(
  headers: Headers
): RawHeadersMap | undefined {
  const headersList = getValueBySymbol<object>('headers list', headers)

  console.log('\n\n----')
  console.log({ headersList })

  if (!headersList) {
    return
  }

  const headersMap = getValueBySymbol<
    Map<string, { name: string; value: string }>
  >('headers map', headersList)

  console.log({ headersList })

  if (!headersMap) {
    return
  }

  const rawHeaders: RawHeadersMap = new Map()

  headersMap?.forEach(({ name, value }) => {
    rawHeaders.set(name, value)
  })

  console.log({ rawHeaders })

  return rawHeaders
}
