const debug = require('debug')('http normalizeHttpRequestEndParams')

type HttpRequestEndChunk = string | Buffer | null
type HttpRequestEndEncoding = string | null
type HttpRequestEndCallback = () => void | undefined

type HttpRequestEndArgs =
  | []
  | [HttpRequestEndCallback]
  | [HttpRequestEndChunk, HttpRequestEndCallback?]
  | [HttpRequestEndChunk, HttpRequestEndEncoding, HttpRequestEndCallback?]

type NormalizedHttpRequestEndParams = [
  HttpRequestEndChunk,
  HttpRequestEndEncoding | undefined,
  HttpRequestEndCallback | undefined
]

/**
 * Normalizes a list of arguments given to the `ClientRequest.end()`
 * method to always include `chunk`, `encoding`, and `callback`.
 * Returned values may be `null`.
 */
export function normalizeHttpRequestEndParams(
  ...args: HttpRequestEndArgs
): NormalizedHttpRequestEndParams {
  debug('arguments', args)
  const normalizedArgs = new Array(3)
    .fill(null)
    .map((_, index) => args[index] || null)

  normalizedArgs.sort((a, b) => {
    if (typeof a === 'function') {
      return 1
    }

    if (typeof a === 'string' && typeof b === 'string') {
      return normalizedArgs.indexOf(a) - normalizedArgs.indexOf(b)
    }

    return 0
  })

  debug('normalized args', normalizedArgs)
  return normalizedArgs as NormalizedHttpRequestEndParams
}
