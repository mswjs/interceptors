import net from 'node:net'
import url from 'node:url'

export interface NetworkConnectionOptions {
  secure?: boolean | null
  port?: number | null
  path: string | null
  host?: string | null
  protocol?: string | null
  auth?: string | null
  family?: number | null
  session?: Buffer
  localAddress?: string | null
  localPort?: number | null
}

export type NetConnectArgs =
  | [options: net.NetConnectOpts, connectionListener?: () => void]
  | [url: URL, connectionListener?: () => void]
  | [port: number, host: string, connectionListener?: () => void]
  | [path: string, connectionListener?: () => void]

export type NormalizedNetConnectArgs = [
  options: NetworkConnectionOptions,
  connectionListener?: () => void
]

/**
 * Normalizes the arguments passed to `net.connect()`.
 */
export function normalizeNetConnectArgs(
  args: NetConnectArgs
): NormalizedNetConnectArgs {
  const callback = typeof args[1] === 'function' ? args[1] : args[2]

  if (typeof args[0] === 'string') {
    return [{ path: args[0] }, callback]
  }

  if (typeof args[0] === 'number' && typeof args[1] === 'string') {
    return [{ port: args[0], path: '', host: args[1] }, callback]
  }

  if (typeof args[0] === 'object') {
    if ('href' in args[0]) {
      const options = url.urlToHttpOptions(args[0])

      return [
        {
          protocol: args[0].protocol,
          path: options.path || '',
          port: +args[0].port,
          host: options.hostname,
          auth: options.auth,
        },
        callback,
      ]
    }

    if ('port' in args[0]) {
      return [
        {
          path: '',
          port: args[0].port,
          host: args[0].host,
          auth: Reflect.get(args[0], 'auth'),
          family: args[0].family,
          session: Reflect.get(args[0], 'session'),
          localAddress: args[0].localAddress,
          localPort: args[0].localPort,
        },
        callback,
      ]
    }

    return [
      {
        path: args[0].path || '',
        family: Reflect.get(args[0], 'family'),
        session: Reflect.get(args[0], 'session'),
        auth: Reflect.get(args[0], 'auth'),
      },
      callback,
    ]
  }

  throw new Error(`Invalid arguments passed to net.connect: ${args}`)
}
