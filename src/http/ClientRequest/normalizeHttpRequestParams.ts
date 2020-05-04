import { RequestOptions } from 'https'
import { HttpRequestCallback } from '../../glossary'
import { urlToOptions } from '../../utils/urlToOptions'

const debug = require('debug')('http:normalize-http-request-params')

function resolveUrl(input: string | URL): URL {
  return typeof input === 'string' ? new URL(input) : input
}

// Request instance constructed by the `request` library
// has a `self` property that has a `uri` field. This is
// reproducible by performing a `XMLHttpRequest` request (jsdom).
interface RequestSelf {
  uri?: URL
}

/**
 * Normalizes parameters given to a `http.request` call
 * so it always has a `URL` and `RequestOptions`.
 */
export function normalizeHttpRequestParams(
  ...args: any[]
): [URL, RequestOptions & RequestSelf, HttpRequestCallback?] {
  let url: URL
  let options: RequestOptions & RequestSelf
  let callback: HttpRequestCallback

  debug('normalizing parameters...')

  // Only `RequestOptions` has the `method` property
  if (args[0].hasOwnProperty('method')) {
    debug('firts parameter is RequestOptions')
    options = args[0]

    const path = options.path || '/'
    const baseUrl = `${options.protocol}//${options.hostname}`

    debug('constructing URL manually...')

    url = options.uri ? new URL(options.uri.href) : new URL(path, baseUrl)
    debug('constructed URL:', url.href)

    callback = args[1]
  } else if (args[1]?.hasOwnProperty('method')) {
    debug('second parameter is RequestOptions')

    url = resolveUrl(args[0])
    debug('resolved URL:', url.href)

    options = args[1]
    callback = args[2]
  } else {
    debug('the first parameter is URL')
    url = resolveUrl(args[0])

    debug('resolved URL:', url.href)

    // At this point `ClientRequest` has been constructed only using URL.
    // Coerce URL into a `RequestOptions` instance.
    options = urlToOptions(url)

    callback = args[1]
  }

  // Enforce protocol on `RequestOptions` so when `ClientRequest` compares
  // the agent protocol and the request options protocol they match.
  // https://github.com/nodejs/node/blob/d84f1312915fe45fe0febe888db692c74894c382/lib/_http_client.js#L142-L145
  // This prevents `Protocol "http:" not supported. Expected "https:"` exception for `https.request` calls.
  options.protocol = options.protocol || url.protocol

  debug('resolved protocol: %s', options.protocol)

  return [url, options, callback]
}
