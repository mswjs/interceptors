import { RequestOptions } from 'https'
import { HttpRequestCallback } from '../../glossary'
import { urlToOptions } from '../../utils/urlToOptions'

const debug = require('debug')('http:normalize-http-request-params')

const DEFAULT_PATH = '/'
const DEFAULT_PROTOCOL = 'http:'

// Request instance constructed by the `request` library
// has a `self` property that has a `uri` field. This is
// reproducible by performing a `XMLHttpRequest` request (jsdom).
interface RequestSelf {
  uri?: URL
}

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
    return urlToOptions(url)
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

    const path = options.path || DEFAULT_PATH

    if (!options.protocol) {
      // Assume HTTPS if using an SSL certificate.
      options.protocol = options.cert ? 'https:' : DEFAULT_PROTOCOL
    }

    const baseUrl = `${options.protocol}//${options.hostname || options.host}`
    debug('created base URL:', baseUrl)

    url = options.uri ? new URL(options.uri.href) : new URL(path, baseUrl)
    debug('created URL:', url)

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
