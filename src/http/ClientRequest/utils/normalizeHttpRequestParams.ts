import { RequestOptions } from 'https'
import { HttpRequestCallback, RequestSelf } from '../../../glossary'
import { getRequestOptionsByUrl } from '../../../utils/getRequestOptionsByUrl'
import { getUrlByRequestOptions } from '../../../utils/getUrlByRequestOptions'

const debug = require('debug')('http normalizeHttpRequestParams')

type HttpRequestArgs =
  | [string | URL, HttpRequestCallback?]
  | [string | URL, RequestOptions, HttpRequestCallback?]
  | [RequestOptions, HttpRequestCallback?]

function resolveRequestOptions(
  args: HttpRequestArgs,
  url: URL
): RequestOptions {
  // Calling `fetch` provides only URL to ClientRequest,
  // without RequestOptions or callback.
  if (['function', 'undefined'].includes(typeof args[1])) {
    return getRequestOptionsByUrl(url)
  }

  return args[1] as RequestOptions
}

function resolveCallback(
  args: HttpRequestArgs
): HttpRequestCallback | undefined {
  return typeof args[1] === 'function' ? args[1] : args[2]
}

/**
 * Normalizes parameters given to a `http.request` call
 * so it always has a `URL` and `RequestOptions`.
 */
export function normalizeHttpRequestParams(
  ...args: HttpRequestArgs
): [URL, RequestOptions & RequestSelf, HttpRequestCallback?] {
  let url: URL
  let options: RequestOptions & RequestSelf
  let callback: HttpRequestCallback | undefined

  debug('arguments', args)

  if (typeof args[0] === 'string') {
    debug('given a location string:', args[0])

    url = new URL(args[0])
    debug('created a URL:', url)

    options = resolveRequestOptions(args, url)
    debug('created request options:', options)

    callback = resolveCallback(args)
  } else if ('origin' in args[0]) {
    url = args[0]
    debug('given a URL:', url)

    options = resolveRequestOptions(args, url)
    debug('created request options', options)

    callback = resolveCallback(args)
  } else if ('method' in args[0]) {
    options = args[0]
    debug('given request options:', options)

    url = getUrlByRequestOptions(options)
    debug('created a URL:', url)

    callback = resolveCallback(args)
  } else {
    throw new Error(
      `Failed to construct ClientRequest with these parameters: ${args}`
    )
  }

  // Enforce protocol on `RequestOptions` so when `ClientRequest` compares
  // the agent protocol to the request options protocol they match.
  // @see https://github.com/nodejs/node/blob/d84f1312915fe45fe0febe888db692c74894c382/lib/_http_client.js#L142-L145
  // This prevents `Protocol "http:" not supported. Expected "https:"` exception for `https.request` calls.
  options.protocol = options.protocol || url.protocol

  debug('resolved URL:', url)
  debug('resolved options:', options)

  return [url, options, callback]
}
