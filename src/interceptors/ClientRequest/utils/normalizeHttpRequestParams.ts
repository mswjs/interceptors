import { RequestOptions } from 'https'
import { Url as LegacyURL } from 'url';
import { HttpRequestCallback, RequestSelf } from '../../../glossary'
import { getRequestOptionsByUrl } from '../../../utils/getRequestOptionsByUrl'
import { getUrlByRequestOptions } from '../../../utils/getUrlByRequestOptions'
import { isObject } from '../../../utils/isObject'

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
  // Handle a legacy Url and re-normalize from either a RequestOptions object
  // or a WHATWG URL
  else if ('hash' in args[0] && !('method' in args[0])) {
    if (args[0].hostname === null) {
      /*
        We are dealing with a relative url, so use the path as an "option" and
        merge-in any existing options, giving priority to exising options -- i.e. a path in any
        existing options will take precedence over the one contained in the url. This is consistent
        with the behaviour in ClientRequest.
        
        https://github.com/nodejs/node/blob/d84f1312915fe45fe0febe888db692c74894c382/lib/_http_client.js#L122
      */
      debug('given a relative legacy url:', args[0])

      return isObject(args[1])
        ? normalizeHttpRequestParams({path: args[0].path, ...args[1]}, args[2])
        : normalizeHttpRequestParams({path: args[0].path}, args[1] as HttpRequestCallback)
    }

    debug('given an absolute legacy url:', args[0])

    //We are dealing with an absolute url, so convert to WHATWG and try again
    const resolvedUrl = new URL(args[0].href)

    return args[1] === undefined
      ? normalizeHttpRequestParams(resolvedUrl)
      : typeof args[1] === 'function'
        ? normalizeHttpRequestParams(resolvedUrl, args[1])
        : normalizeHttpRequestParams(resolvedUrl, args[1], args[2])
  }
  // Handle a given request options object as-is
  // and derive the URL instance from it.
  else if (isObject(args[0])) {
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
