import net from 'node:net'
import { NetworkConnectionOptions } from './normalize-net-connect-args'

export function getAddressInfoByConnectionOptions(
  options?: NetworkConnectionOptions
): ReturnType<net.Socket['address']> {
  if (options == null) {
    return {}
  }

  const isIPv6 = options.family === 6 || net.isIPv6(options.host || '')

  return {
    address: isIPv6 ? '::1' : '127.0.0.1',
    /**
     * @note Coerce the port to a number. Connection options may
     * describe it as a string (e.g. when created from a URL), while
     * the address info always reports a numeric port.
     */
    port: Number(options.port) || (options.protocol === 'https:' ? 443 : 80),
    family: isIPv6 ? 'IPv6' : 'IPv4',
  }
}

/**
 * Get the local address info for the given connection options.
 * This describes the client-side end of the connection: the socket
 * is bound to the loopback interface and an ephemeral port, the same
 * way the operating system binds an outgoing connection.
 */
export function getLocalAddressInfoByConnectionOptions(
  options?: NetworkConnectionOptions
): ReturnType<net.Socket['address']> {
  if (options == null) {
    return {}
  }

  const isIPv6 = options.family === 6 || net.isIPv6(options.host || '')

  return {
    address: options.localAddress || (isIPv6 ? '::1' : '127.0.0.1'),
    port: options.localPort || getEphemeralPort(),
    family: isIPv6 ? 'IPv6' : 'IPv4',
  }
}

/**
 * Get a random port from the ephemeral range (IANA: 49152-65535),
 * the range the operating system draws from when binding an
 * outgoing connection.
 */
function getEphemeralPort(): number {
  return 49152 + Math.floor(Math.random() * (65535 - 49152 + 1))
}
