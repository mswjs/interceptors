import { Agent } from 'http'
import { RequestOptions, Agent as HttpsAgent } from 'https'
import { agent } from 'supertest'
import { RequestSelf } from '../glossary'

const debug = require('debug')('utils getUrlByRequestOptions')

export const DEFAULT_PATH = '/'
const DEFAULT_PROTOCOL = 'http:'
const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = 80

/**
 * Creates a `URL` instance from a given `RequestOptions` object.
 */
export function getUrlByRequestOptions(
  options: RequestOptions & RequestSelf
): URL {
  const path = options.path || DEFAULT_PATH
  const agentOptions =
    options.agent instanceof Agent ? (options.agent as RequestOptions) : null

  debug('creating URL from options:', options)

  // Inherit the protocol from the Agent, if present.
  if (agentOptions) {
    debug(
      'inherited protocol "%s" from Agent',
      agentOptions?.protocol,
      agentOptions
    )

    options.protocol = agentOptions?.protocol
  }

  if (!options.protocol) {
    debug('given no protocol, resolving...')

    // Assume HTTPS if cert is set.
    options.protocol = options.cert
      ? 'https:'
      : options.uri?.protocol || DEFAULT_PROTOCOL

    debug('resolved protocol to:', options.protocol)
  }

  const baseUrl = `${options.protocol}//${
    options.hostname || options.host || DEFAULT_HOST
  }`
  debug('using base URL:', baseUrl)

  const url = options.uri ? new URL(options.uri.href) : new URL(path, baseUrl)

  if (
    !!options.port ||
    agentOptions?.defaultPort ||
    (agentOptions as HttpsAgent)?.options.port
  ) {
    const agentPort =
      agentOptions instanceof HttpsAgent
        ? agentOptions.options.port
        : agentOptions?.defaultPort
    const urlPort = options.port || agentPort || DEFAULT_PORT
    debug('resolved port', urlPort)

    url.port = urlPort.toString()
  }

  if (!!options.auth) {
    const [username, password] = options.auth.split(':')
    url.username = username
    url.password = password

    debug('resolved auth', { username, password })
  }

  debug('created URL:', url)

  return url
}
