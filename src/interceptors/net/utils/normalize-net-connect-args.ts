import net from 'node:net'

export interface NetworkConnectionOptions {
  port?: number
  path: string
  host?: string
  protocol?: string
  auth?: string
  localAddress?: string
  localPort?: number
}

export type NetConnectArgs =
  | [options: net.NetConnectOpts, connectionListener?: () => void]
  | [url: URL, connectionListener?: () => void]
  | [port: number, host: string, connectionListener?: () => void]
  | [path: string, connectionListener?: () => void]

export function normalizeNetConnectArgs(
  args: NetConnectArgs
): [options: NetworkConnectionOptions, connectionListener?: () => void] {
  if (typeof args[0] === 'string') {
    return [{ path: args[0] }, args[1]]
  }

  if (typeof args[0] === 'number' && typeof args[1] === 'string') {
    return [{ port: args[0], path: '', host: args[1] }, args[2]]
  }

  if (typeof args[0] === 'object') {
    if ('href' in args[0]) {
      return [
        {
          path: args[0].pathname || '',
          port: +args[0].port,
          host: args[0].host,
          protocol: args[0].protocol,
        },
        args[1],
      ]
    }

    if ('port' in args[0]) {
      return [
        {
          path: '',
          port: args[0].port,
          host: args[0].host,
          auth: Reflect.get(args[0], 'auth'),
          localAddress: args[0].localAddress,
          localPort: args[0].localPort,
        },
        args[1],
      ]
    }

    return [
      {
        path: args[0].path || '',
        auth: Reflect.get(args[0], 'auth'),
      },
      args[1],
    ]
  }

  throw new Error(`Invalid arguments passed to net.connect: ${args}`)
}
