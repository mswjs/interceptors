import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import {
  MockSocket,
  MockTlsSocket,
  SocketController,
  DuplexStreamProxy,
} from './mock-socket'
import {
  normalizeNetConnectArgs,
  type NetConnectArgs,
  type NetworkConnectionOptions,
} from './utils/normalize-net-connect-args'
import {
  normalizeTlsConnectArgs,
  TlsConnectArgs,
} from './utils/normalize-tls-connect-args.test'

export interface SocketConnectionEventMap {
  connection: [
    args: {
      socket: MockSocket
      options: NetworkConnectionOptions
      controller: SocketController<net.Socket>
    }
  ]
}

const kImplementation = Symbol('kImplementation')
const kOriginalValue = Symbol('kOriginalValue')

function createSwitchableProxy(target: any) {
  return new Proxy(target, {
    apply(target, thisArg, argArray) {
      return Reflect.get(target, kImplementation).apply(thisArg, argArray)
    },
  })
}

if (Reflect.get(net.connect, kImplementation) == null) {
  /**
   * Apply a transparent proxy to the "node:net" module on the module's scope.
   * This way, this interceptor can function if it gets imported before the surface
   * that relies on "node:net", like "node:http" or "undici".
   *
   * @note You MUST import the interceptor BEFORE the surface relying on "node:net".
   */
  const { connect: originalConnect } = net

  Object.defineProperties(net.connect, {
    [kOriginalValue]: {
      value: originalConnect,
    },
    [kImplementation]: {
      writable: true,
      value() {
        return Reflect.get(net.connect, kOriginalValue)
      },
    },
  })

  net.connect = createSwitchableProxy(net.connect)
  /**
   * `net.createConnection` is an alias for `net.connect`.
   * @see https://github.com/nodejs/node/blob/9bcc5a8f01acf9583b45b3bbddf8f043a001bb3c/lib/net.js#L2489
   */
  net.createConnection = net.connect
}

if (Reflect.get(tls.connect, kImplementation) == null) {
  const { connect: originalConnect } = tls

  Object.defineProperties(tls.connect, {
    [kOriginalValue]: {
      value: originalConnect,
    },
    [kImplementation]: {
      writable: true,
      value() {
        return Reflect.get(tls.connect, kOriginalValue)
      },
    },
  })

  tls.connect = createSwitchableProxy(tls.connect)
}

export class SocketInterceptor extends Interceptor<SocketConnectionEventMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const originalNetConnect = Reflect.get(
      net.connect,
      kOriginalValue
    ) as typeof net.connect

    this.subscriptions.push(() => {
      Reflect.set(net.connect, kImplementation, originalNetConnect)
    })

    Reflect.set(
      net.connect,
      kImplementation,
      (...args: [any, any]): net.Socket => {
        const [options, connectionCallback] = normalizeNetConnectArgs(
          args as NetConnectArgs
        )

        const socket = new MockSocket({
          ...args,
          connectionCallback,
        })

        const controller = new SocketController({
          socket: socket,
          proxy: new DuplexStreamProxy(socket),
          createConnection() {
            return originalNetConnect(...args)
          },
        })

        /**
         * @note Do NOT call `socket.connect()` here.
         * Instead, keep the socket connection pending and delegate the actual
         * connect to the user. Calling `.connect()` on a mock socket is handy
         * for simulating a successful connection. Calling `.passthrough()` will
         * tap into the unpatched `net.connect()`, which will call `socket.connect()`.
         */

        process.nextTick(() => {
          this.emitter.emit('connection', {
            options,
            socket,
            controller,
          })
        })

        return controller.socket
      }
    )

    const originalTlsConnect = Reflect.get(
      tls.connect,
      kOriginalValue
    ) as typeof tls.connect

    this.subscriptions.push(() => {
      Reflect.set(tls.connect, kImplementation, originalTlsConnect)
    })

    Reflect.set(
      tls.connect,
      kImplementation,
      (...args: [any, any]): tls.TLSSocket => {
        const [tlsOptions, secureConnectionListener] = normalizeTlsConnectArgs(
          args as TlsConnectArgs
        )

        /**
         * @fixme Ignore TLS sockets where `options.isServer` is `true`.
         * Those are constructed for server responses and we shouldn't touch them.
         */

        /**
         * Call the original `tls.connect()` to initialize the wrap
         * around the underlying `MockSocket`. No need to manage TLS manually.
         * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/internal/tls/wrap.js#L1695
         */

        const socket = new MockSocket({
          ...tlsOptions,
          secure: true,
        })
        const tlsSocket = new MockTlsSocket(
          socket,
          tlsOptions,
          secureConnectionListener
        )

        const controller = new SocketController({
          socket: tlsSocket,
          // Proxy the TLS socket because:
          // - a TLS socket is not guaranteed to have an underlying socket (may use "_handle").
          // - the client calls write/end on the TLS socket, not the underlying socket.
          proxy: new DuplexStreamProxy(tlsSocket),
          createConnection() {
            return originalTlsConnect(...args)
          },
        })

        process.nextTick(() => {
          this.emitter.emit('connection', {
            /**
             * @fixme Can we guarantee these options will have "protocol"
             * and such? Dunno, dunno.
             */
            options: tlsOptions,
            socket: tlsSocket,
            controller,
          })
        })

        return controller.socket
      }
    )
  }
}
