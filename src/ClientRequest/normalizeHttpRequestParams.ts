import { RequestOptions } from 'https'
import { HttpRequestCallback } from '../glossary'

function resolveUrl(input: string | URL): URL {
  return typeof input === 'string' ? new URL(input) : input
}

/**
 * Normalizes parameters given to a `http.request` call
 * so it always has a `URL` and `RequestOptions`.
 */
export function normalizeHttpRequestParams(
  ...args: any[]
): [URL, RequestOptions, HttpRequestCallback?] {
  let url: URL
  let options: RequestOptions
  let callback: HttpRequestCallback

  // Only `RequestOptions` has the `method` property
  if (args[0].hasOwnProperty('method')) {
    options = args[0]
    url = new URL(
      options.path || '/',
      `${options.protocol}//${options.hostname}`
    )
    callback = args[1]
  } else if (args[1]?.hasOwnProperty('method')) {
    url = resolveUrl(args[0])
    options = args[1]
    callback = args[2]
  } else {
    url = resolveUrl(args[0])

    // At this point reconstruct `RequestOptions` from the URL
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
