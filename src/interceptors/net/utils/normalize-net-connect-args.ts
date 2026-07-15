import net from 'node:net'

export interface NetworkConnectionOptions {
  /**
   * @note The port may be a string when a URL is (incorrectly) passed
   * to `net.connect()`. Node.js reads URLs as plain options objects.
   */
  port?: number | string | null
  path: string | null
  host?: string | null
  protocol?: string | null
  auth?: string | null
  family?: number | null
  session?: Buffer
  localAddress?: string | null
  localPort?: number | null
  timeout?: number
  lookup?: net.LookupFunction
}

export type NetConnectArgs =
  | []
  | [options: net.NetConnectOpts, callback?: () => void]
  | [url: URL, callback?: () => void]
  | [port: number, host?: string, callback?: () => void]
  | [port: number, callback?: () => void]
  | [path: string, callback?: () => void]

export type NormalizedNetConnectArgs = [
  options: NetworkConnectionOptions,
  callback: (() => void) | null,
]

/**
 * Normalizes the arguments passed to `net.connect()`.
 */
export function normalizeNetConnectArgs(
  args: NetConnectArgs
): NormalizedNetConnectArgs {
  if (args.length === 0) {
    return [{ path: '' }, null]
  }

  const callback = typeof args[1] === 'function' ? args[1] : args[2] || null

  if (typeof args[0] === 'string') {
    return [{ path: args[0] }, callback]
  }

  if (typeof args[0] === 'number') {
    return [
      {
        port: args[0],
        path: '',
        /**
         * @note The host is optional in the "(port[, host][, callback])"
         * signatures and defaults to "localhost" in Node.js.
         */
        host: typeof args[1] === 'string' ? args[1] : undefined,
      },
      callback,
    ]
  }

  if (typeof args[0] === 'object') {
    /**
     * @note URL arguments receive no special treatment on purpose.
     * Node.js does not support them and reads a given URL as a plain
     * options object (e.g. "url.port" is a string, "url.host" includes
     * the port). The "port" branch below reproduces that reading.
     */
    if ('port' in args[0]) {
      return [
        {
          path: '',
          port: Reflect.get(args[0], 'port'),
          host: Reflect.get(args[0], 'host'),
          auth: Reflect.get(args[0], 'auth'),
          family: Reflect.get(args[0], 'family'),
          session: Reflect.get(args[0], 'session'),
          localAddress: Reflect.get(args[0], 'localAddress'),
          localPort: Reflect.get(args[0], 'localPort'),
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
