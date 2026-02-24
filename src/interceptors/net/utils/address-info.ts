import net from 'node:net'
import { NetworkConnectionOptions } from './normalize-net-connect-args'

export function getAddressInfoByConnectionOptions(
  options?: NetworkConnectionOptions
): ReturnType<net.Socket['address']> {
  if (options == null) {
    return {}
  }

  const isIPv6 = options.family === 6 || net.isIPv6(options.host || '')
  const ipAddress = options.host
    ? net.isIP(options.host) !== 0
      ? options.host
      : null
    : null

  return {
    address: ipAddress || isIPv6 ? '::1' : '127.0.0.1',
    port: options.port || (options.protocol === 'https:' ? 443 : 80),
    family: isIPv6 ? 'ipv6' : 'ipv4',
  }
}
