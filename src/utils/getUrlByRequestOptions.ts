import { Agent } from 'http'
import { RequestOptions, Agent as HttpsAgent } from 'https'

const debug = require('debug')('utils getUrlByRequestOptions')

// Request instance constructed by the "request" library
// has a "self" property that has a "uri" field. This is
// reproducible by performing a "XMLHttpRequest" request in JSDOM.
export interface RequestSelf {
  uri?: URL
}

export type ResolvedRequestOptions = RequestOptions & RequestSelf

export const DEFAULT_PATH = '/'
const DEFAULT_PROTOCOL = 'http:'
const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = 80
const SSL_PORT = 443

function getAgent(
  options: ResolvedRequestOptions
): Agent | HttpsAgent | undefined {
  return options.agent instanceof Agent ? options.agent : undefined
}

function getProtocolByRequestOptions(options: ResolvedRequestOptions): string {
  if (options.protocol) {
    return options.protocol
  }

  const agent = getAgent(options)
  const agentProtocol = (agent as RequestOptions)?.protocol

  if (agentProtocol) {
    return agentProtocol
  }

  const port = getPortByRequestOptions(options)
  const isSecureRequest = options.cert || port === SSL_PORT

  return isSecureRequest ? 'https:' : options.uri?.protocol || DEFAULT_PROTOCOL
}

function getPortByRequestOptions(
  options: ResolvedRequestOptions
): number | undefined {
  // Use the explicitly provided port.
  if (options.port) {
    return Number(options.port)
  }

  // Extract the port from the hostname.
  if (options.hostname != null) {
    const [, extractedPort] = options.hostname.match(/:(\d+)$/) || []

    if (extractedPort != null) {
      return Number(extractedPort)
    }
  }

  // Otherwise, try to resolve port from the agent.
  const agent = getAgent(options)

  if ((agent as HttpsAgent)?.options.port) {
    return Number((agent as HttpsAgent).options.port)
  }

  if ((agent as RequestOptions)?.defaultPort) {
    return Number((agent as RequestOptions).defaultPort)
  }

  // Lastly, return undefined indicating that the port
  // must inferred from the protocol. Do not infer it here.
  return undefined
}

function getHostByRequestOptions(options: ResolvedRequestOptions): string {
  const { hostname, host } = options

  // If the hostname is specified, resolve the host from the "host:port" string.
  if (hostname != null) {
    return hostname.replace(/:\d+$/, '')
  }

  return host || DEFAULT_HOST
}

function getAuthByRequestOptions(options: ResolvedRequestOptions) {
  if (options.auth) {
    const [username, password] = options.auth.split(':')
    return { username, password }
  }
}

/**
 * Returns true if host looks like an IPv6 address without surrounding brackets
 * It assumes any host containing `:` is definitely not IPv4 and probably IPv6,
 * but note that this could include invalid IPv6 addresses as well.
 */
function isRawIPv6Address(host: string): boolean {
  return host.includes(':') && !host.startsWith('[') && !host.endsWith(']')
}

function getHostname(host: string, port?: number): string {
  const portString = typeof port !== 'undefined' ? `:${port}` : ''

  /**
   * @note As of Node >= 17, hosts (including "localhost") can resolve to IPv6
   * addresses, so construct valid URL by surrounding the IPv6 host with brackets.
   */
  if (isRawIPv6Address(host)) {
    return `[${host}]${portString}`
  }

  if (typeof port === 'undefined') {
    return host
  }

  return `${host}${portString}`
}

function getBaseUrl(options: ResolvedRequestOptions): URL {
  const protocol = getProtocolByRequestOptions(options)
  debug('protocol', protocol)

  const host = getHostByRequestOptions(options)
  debug('host', host)

  const port = getPortByRequestOptions(options)
  debug('port', port)

  const hostname = getHostname(host, port)
  debug('hostname', hostname)

  const path = options.path || DEFAULT_PATH
  debug('path', path)

  const credentials = getAuthByRequestOptions(options)
  debug('credentials', credentials)

  const authString = credentials
    ? `${credentials.username}:${credentials.password}@`
    : ''
  debug('auth string:', authString)

  return new URL(`${protocol}//${authString}${hostname}${path}`)
}

/**
 * Creates a `URL` instance from a given `RequestOptions` object.
 */
export function getUrlByRequestOptions(options: ResolvedRequestOptions): URL {
  debug('request options', options)

  const baseUrl = getBaseUrl(options)
  debug('base url:', baseUrl)

  const url = options.uri ? new URL(options.uri.href) : baseUrl
  debug('created url:', url)

  return url
}
