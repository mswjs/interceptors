import tls from 'node:tls'
import {
  type NetConnectArgs,
  normalizeNetConnectArgs,
} from './normalize-net-connect-args'

type TlsConnectArgs =
  | []
  | [options: tls.ConnectionOptions, callback?: () => void]
  | [url: URL, callback?: () => void]
  | [port: number, options?: tls.ConnectionOptions, callback?: () => void]
  | [
      port: number,
      host?: string,
      options?: tls.ConnectionOptions,
      callback?: () => void,
    ]

type NormalizedTlsConnectionArgs = [
  options: tls.ConnectionOptions,
  callback?: (() => void) | null,
]

export function normalizeTlsConnectArgs(
  args: TlsConnectArgs
): NormalizedTlsConnectionArgs {
  /**
   * @note Despite incorrect type definitions, "tls.connect()" has all the
   * options of "net.connect()" and then those specific to TLS connections,
   * like "session" or "socket".
   * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L1615
   */
  const netConnectArgs = normalizeNetConnectArgs(args as NetConnectArgs)
  const options = netConnectArgs[0] as tls.ConnectionOptions
  const callback = netConnectArgs[1]

  if (args[0] !== null && typeof args[0] === 'object') {
    Object.assign(options, args[0])
  } else if (args[1] !== null && typeof args[1] === 'object') {
    Object.assign(options, args[1])
  } else if (args[2] !== null && typeof args[2] === 'object') {
    Object.assign(options, args[2])
  }

  return callback ? [options, callback] : [options]
}
