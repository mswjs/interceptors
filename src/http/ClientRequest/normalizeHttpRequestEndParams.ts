const debug = require('debug')('http normalizeHttpRequestEndParams')

type HttpRequestEndChunk = string | Buffer
type HttpRequestEndEncoding = string
type HttpRequestEndCallback = () => void

type HttpRequestEndArgs =
  | []
  | [HttpRequestEndCallback]
  | [HttpRequestEndChunk, HttpRequestEndCallback?]
  | [HttpRequestEndChunk, HttpRequestEndEncoding, HttpRequestEndCallback?]

type NormalizedHttpRequestEndParams = [
  HttpRequestEndChunk | null,
  HttpRequestEndEncoding | null,
  HttpRequestEndCallback | null
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
    .map((value, index) => args[index] || value)

  normalizedArgs.sort((a, b) => {
    // If first element is a function, move it rightwards.
    if (typeof a === 'function') {
      return 1
    }

    // If second element is a function, move the first leftwards.
    if (typeof b === 'function') {
      return -1
    }

    // If both elements are strings, preserve their original index.
    if (typeof a === 'string' && typeof b === 'string') {
      return normalizedArgs.indexOf(a) - normalizedArgs.indexOf(b)
    }

    return 0
  })

  debug('normalized args', normalizedArgs)
  return normalizedArgs as NormalizedHttpRequestEndParams
}
