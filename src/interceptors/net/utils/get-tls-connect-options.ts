import type tls from 'node:tls'

/**
 * Returns the original options the given TLS socket was created with.
 * The original `tls.connect()` stores them on the socket instance
 * under an internal symbol before connecting its transport.
 * @see https://github.com/nodejs/node/blob/3178a762d6a2b1a37b74f02266eea0f3d86603f1/lib/_tls_wrap.js#L1690
 */
export function getTlsConnectOptions(
  socket: tls.TLSSocket
): tls.ConnectionOptions | undefined {
  const kConnectOptions = Object.getOwnPropertySymbols(socket).find(
    (symbol) => {
      return symbol.description === 'connect-options'
    }
  )

  if (kConnectOptions == null) {
    return undefined
  }

  return Reflect.get(socket, kConnectOptions)
}
