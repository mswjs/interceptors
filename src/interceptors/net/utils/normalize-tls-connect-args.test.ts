import tls from 'node:tls'

export type TlsConnectArgs =
  | [options: tls.ConnectionOptions, secureConnectionListener?: () => void]
  | [
      port: number,
      host?: string,
      options?: tls.ConnectionOptions,
      secureConnectionListener?: () => void
    ]
  | [
      port: number,
      options?: tls.ConnectionOptions,
      secureConnectionListener?: () => void
    ]

export function normalizeTlsConnectArgs(
  args: TlsConnectArgs
): [tls.ConnectionOptions, secureConnectionListener?: () => void] {
  if (typeof args[0] === 'object') {
    const callback = typeof args[1] === 'function' ? args[1] : undefined
    return [args[0], callback]
  }

  if (typeof args[0] === 'number') {
    const options = typeof args[1] === 'object' ? args[1] : {}
    const host = typeof args[1] === 'string' ? args[1] : undefined
    const callback = typeof args[2] === 'function' ? args[2] : args[3]

    return [
      {
        port: args[0],
        host,
        ...options,
      },
      callback,
    ]
  }

  throw new TypeError('Invalid `tls.connect` arguments')
}
