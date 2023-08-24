import net from 'net'
import http from 'http'
import { Interceptor } from '../../Interceptor'
import { SocketController, SocketOverride } from './SocketController'
import { normalizeClientRequestArgs } from '../ClientRequest/utils/normalizeClientRequestArgs'

export interface SocketEventsMap {
  request: [args: { request: Request }]
}

export class SocketInterceptor extends Interceptor<SocketEventsMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected async setup() {
    // const netM = await import('net')
    // const net = netM.default

    const socketProxy = Proxy.revocable(net.Socket, {
      apply(target, context, args) {
        console.log('net.Socket()')
        return Reflect.apply(target, context, args)
      },
    })
    net.Socket = socketProxy.proxy
    this.subscriptions.push(() => socketProxy.revoke())

    const connectProxy = Proxy.revocable(net.connect, {
      apply(target, context, args) {
        console.log('net.connect()')
        return Reflect.apply(target, context, args)
      },
    })
    net.connect = connectProxy.proxy
    this.subscriptions.push(() => connectProxy.revoke())

    const createConnectionProxy = Proxy.revocable(net.createConnection, {
      apply(target, context, args) {
        console.log('net.createConnection()')

        return new SocketOverride(args[1])
        return Reflect.apply(target, context, args)
      },
    })
    net.createConnection = createConnectionProxy.proxy
    this.subscriptions.push(() => createConnectionProxy.revoke())

    http.get = new Proxy(http.get, {
      apply(target, context, args) {
        const [url, options, callback] = normalizeClientRequestArgs(
          'http:',
          ...args
        )

        delete options.agent
        options.createConnection = function () {
          console.log('createConnection()')
          return new SocketOverride(url)
        }

        const request = Reflect.apply(target, context, [url, options, callback])

        return request
      },
    })

    console.log('setup() done!')
  }

  // protected createSocketController(
  //   socket: net.Socket,
  //   connectionOptions?: net.NetConnectOpts
  // ): void {
  //   const controller = new SocketController(socket, connectionOptions)

  //   //
  // }
}
