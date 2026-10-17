import net from 'node:net'
import tls from 'node:tls'
import { NetworkConnectionOptions } from './normalize-net-connect-args'

/**
 * Creates a `URL` instance out of the `net.connect()` options.
 * @note This implies that the passed connection is an HTTP connection.
 */
export function connectionOptionsToUrl(
  options: NetworkConnectionOptions,
  socket: net.Socket
): URL {
  const isIPv6 = net.isIPv6(options.host || '')
  const protocol =
    socket instanceof tls.TLSSocket
      ? 'https:'
      : getProtocolByConnectionOptions(options)
  const host = options.host || 'localhost'

  const url = new URL(`${protocol}//${isIPv6 ? `[${host}]` : host}`)

  if (options.path) {
    url.pathname = options.path
  }

  if (options.port) {
    url.port = options.port.toString()
  }

  /**
   * @note The "auth" option is deliberately not written to the URL.
   * Credentials belong to a request, not to the connection: a kept-alive
   * socket serves many requests, and only the first one carries "auth".
   * The client ("http.ClientRequest") already sends it as the
   * "Authorization" header of that request, which the parser reads.
   */
  return url
}

function getProtocolByConnectionOptions(
  options: NetworkConnectionOptions
): 'https:' | 'http:' | (string & {}) {
  if (options.protocol) {
    return options.protocol
  }

  if (options.port === 443) {
    return 'https:'
  }

  return 'http:'
}
