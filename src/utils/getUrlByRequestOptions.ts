import { RequestOptions } from 'https'
import { RequestSelf } from '../glossary'

const debug = require('debug')('http:get-url-by-request-options')

const DEFAULT_PATH = '/'
const DEFAULT_PROTOCOL = 'http:'

/**
 * Creates a `URL` instance from a given `RequestOptions` object.
 */
export function getUrlByRequestOptions(
  options: RequestOptions & RequestSelf
): URL {
  const path = options.path || DEFAULT_PATH

  debug('creating URL from options:', debug)

  if (!options.protocol) {
    debug('given no protocol, resolving...')

    // Assume HTTPS if using an SSL certificate.
    options.protocol = options.cert ? 'https:' : DEFAULT_PROTOCOL

    debug('resolved protocol to:', options.protocol)
  }

  const baseUrl = `${options.protocol}//${options.hostname || options.host}`
  debug('using base URL:', baseUrl)

  const url = options.uri ? new URL(options.uri.href) : new URL(path, baseUrl)
  debug('created URL:', url)

  return url
}
