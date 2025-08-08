import net from 'node:net'
import { NetworkConnectionOptions } from './normalize-net-connect-args'

/**
 * Creates a `URL` instance out of the `net.connect()` options.
 * @note This implies that the passed connection is an HTTP connection.
 */
export function connectOptionsToUrl(options: NetworkConnectionOptions): URL {
  const isIPv6 = options.family === 6 || net.isIPv6(options.host || '')
  const protocol = getProtocolByConnectionOptions(options)
  const host = options.host || 'localhost'

  const url = new URL(`${protocol}//${isIPv6 ? `[${host}]` : host}`)

  if (options.path) {
    url.pathname = options.path
  }

  if (options.port) {
    url.port = options.port.toString()
  }

  if (options.auth) {
    const [username, password] = options.auth.split(':')
    /**
     * Authentication options are provided as plain values.
     * Encode them to form a valid URL.
     * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/internal/url.js#L1452
     */
    url.username = encodeURIComponent(username)
    url.password = encodeURIComponent(password)
  }

  return url
}

function getProtocolByConnectionOptions(
  options: NetworkConnectionOptions
): string {
  if (options.protocol) {
    return options.protocol
  }

  if (options.secure) {
    return 'https:'
  }

  return options.port === 443 ? 'https:' : 'http:'
}
