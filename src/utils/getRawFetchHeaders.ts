import { getValueBySymbol } from './getValueBySymbol'
import { isObject } from './isObject'

type RawHeadersMap = Map<string, string>
type HeadersMapHeader = { name: string; value: string }

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

  if (!headersList) {
    return
  }

  const headersMap = getValueBySymbol<
    Map<string, string> | Map<string, HeadersMapHeader>
  >('headers map', headersList)

  /**
   * @note Older versions of Node.js (e.g. 18.8.0) keep headers map
   * as Map<normalizedHeaderName, value> without any means to tap
   * into raw header values. Detect that and return undefined.
   */
  if (!headersMap || !isHeadersMapWithRawHeaderNames(headersMap)) {
    return
  }

  // Raw headers is a map of { rawHeaderName: rawHeaderValue }
  const rawHeaders: RawHeadersMap = new Map<string, string>()

  headersMap.forEach(({ name, value }) => {
    rawHeaders.set(name, value)
  })

  return rawHeaders
}

function isHeadersMapWithRawHeaderNames(
  headersMap: Map<string, string> | Map<string, HeadersMapHeader>
): headersMap is Map<string, HeadersMapHeader> {
  return Array.from(
    headersMap.values() as Iterable<string | HeadersMapHeader>
  ).every((value) => {
    return isObject<HeadersMapHeader>(value) && 'name' in value
  })
}
