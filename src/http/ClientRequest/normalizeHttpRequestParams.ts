import { RequestOptions } from 'https'
import { HttpRequestCallback } from '../../glossary'

const debug = require('debug')('http:normalize-http-request-params')

function resolveUrl(input: string | URL): URL {
  return typeof input === 'string' ? new URL(input) : input
}

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
    debug('constructed URL:', url)

    callback = args[1]
  } else if (args[1]?.hasOwnProperty('method')) {
    debug('second parameter is RequestOptions')

    url = resolveUrl(args[0])
    debug('resolved URL:', url)

    options = args[1]
    callback = args[2]
  } else {
    debug('the first parameter is URL')
    url = resolveUrl(args[0])

    debug('resolved URL:', url)

    // At this point `ClientRequest` has been constructed only using URL.
    // Coerce URL into a `RequestOptions` instance.
    options = {
      method: 'GET',
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
    }

    callback = args[1]
  }

  return [url, options, callback]
}
