import { RequestOptions } from 'https'
import { Url as LegacyURL } from 'url'
import { getRequestOptionsByUrl } from '../../../utils/getRequestOptionsByUrl'
import { getUrlByRequestOptions } from '../../../utils/getUrlByRequestOptions'
import { cloneObject } from '../../../utils/cloneObject'
import { isObject } from '../../../utils/isObject'
import { HttpRequestCallback, RequestSelf } from '../ClientRequest.glossary'

const debug = require('debug')('http normalizeHttpRequestParams')

type HttpRequestArgs =
  | [string | URL | LegacyURL, HttpRequestCallback?]
  | [string | URL | LegacyURL, RequestOptions, HttpRequestCallback?]
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

  /**
   * Clone the request options to lock their state
   * at the moment they are provided to `ClientRequest.
   * @see https://github.com/mswjs/node-request-interceptor/issues/86
   */
  return args[1] ? cloneObject(args[1]) : ({} as RequestOptions)
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
  defaultProtocol: string,
  ...args: HttpRequestArgs
): [URL, RequestOptions & RequestSelf, HttpRequestCallback?] {
  let url: URL
  let options: RequestOptions & RequestSelf
  let callback: HttpRequestCallback | undefined

  debug('arguments', args)
  debug('default protocol', defaultProtocol)

  // Convert a url string into a URL instance
  // and derive request options from it.
  if (typeof args[0] === 'string') {
    debug('given a location string:', args[0])

    url = new URL(args[0])
    debug('created a URL:', url)

    options = resolveRequestOptions(args, url)
    debug('created request options:', options)

    callback = resolveCallback(args)
  }
  // Handle a given URL instance as-is
  // and derive request options from it.
  else if ('origin' in args[0]) {
    url = args[0]
    debug('given a URL:', url)

    options = resolveRequestOptions(args, url)
    debug('created request options', options)

    callback = resolveCallback(args)
  }
  // Handle a legacy URL instance and re-normalize from either a RequestOptions object
  // or a WHATWG URL.
  else if ('hash' in args[0] && !('method' in args[0])) {
    const [legacyUrl] = args

    if (legacyUrl.hostname === null) {
      // We are dealing with a relative url, so use the path as an "option" and
      // merge in any existing options, giving priority to exising options -- i.e. a path in any
      // existing options will take precedence over the one contained in the url. This is consistent
      // with the behaviour in ClientRequest.
      // https://github.com/nodejs/node/blob/d84f1312915fe45fe0febe888db692c74894c382/lib/_http_client.js#L122
      debug('given a relative legacy URL:', legacyUrl)

      return isObject(args[1])
        ? normalizeHttpRequestParams(
            defaultProtocol,
            { path: legacyUrl.path, ...args[1] },
            args[2]
          )
        : normalizeHttpRequestParams(
            defaultProtocol,
            { path: legacyUrl.path },
            args[1] as HttpRequestCallback
          )
    }

    debug('given an absolute legacy url:', legacyUrl)

    // We are dealing with an absolute URL, so convert to WHATWG and try again.
    const resolvedUrl = new URL(legacyUrl.href)

    return args[1] === undefined
      ? normalizeHttpRequestParams(defaultProtocol, resolvedUrl)
      : typeof args[1] === 'function'
      ? normalizeHttpRequestParams(defaultProtocol, resolvedUrl, args[1])
      : normalizeHttpRequestParams(
          defaultProtocol,
          resolvedUrl,
          args[1],
          args[2]
        )
  }
  // Handle a given RequestOptions object as-is
  // and derive the URL instance from it.
  else if (isObject(args[0])) {
    options = args[0]
    debug('given request options:', options)

    // When handling a `RequestOptions` object without an explicit "protocol",
    // infer the protocol from the request issuing module (http/https).
    options.protocol = options.protocol || defaultProtocol
    debug('normalized request options:', options)

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
  options.method = options.method || 'GET'

  debug('resolved URL:', url)
  debug('resolved options:', options)

  return [url, options, callback]
}
