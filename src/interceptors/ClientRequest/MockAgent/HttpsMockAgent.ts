import * as http from 'http'
import * as https from 'https'
import { Socket } from 'net'
import type { ClientRequestEmitter } from '..'
import type { MockAgentOptions } from './HttpMockAgent'

declare module 'https' {
  interface Agent {
    addRequest(
      request: http.ClientRequest,
      options?: https.RequestOptions
    ): void
  }
}

export class HttpsMockAgent extends https.Agent {
  public emitter: ClientRequestEmitter

  public next: (
    request: http.ClientRequest,
    options?: https.RequestOptions
  ) => void

  constructor(mockOptions: MockAgentOptions, options?: https.AgentOptions) {
    super(options)

    this.emitter = mockOptions.emitter

    this.next = https.Agent.prototype.addRequest.bind(this)

    /**
     * @see https://github.dev/nodejs/node/blob/dbe5874c7e21658113993d07a2426299edfc2f8c/lib/net.js#L1006-L1007
     */
    Socket.prototype.connect = new Proxy(Socket.prototype.connect, {
      apply(target: any, socket: any, args: any[]) {
        console.warn('SOCKET CONNECT', socket, (socket as any)._handle)

        const [request] = args

        if (request.pathname === '/non-existing') {
          console.log(socket._handle.emit)

          socket.emit('lookup')
          socket.emit('connect')
          return
        }

        return Reflect.apply(target, socket, args)
      },
    })
  }

  // async addRequest(
  //   request: http.ClientRequest,
  //   options?: https.RequestOptions
  // ): Promise<void> {
  //   return handleRequest.call(this, request, options)
  // }

  // createSocket(
  //   request: http.ClientRequest,
  //   options: https.RequestOptions,
  //   callback: any
  // ): void {
  //   console.log('create socket', request.method, request.path)

  //   const socket = new Socket({
  //     // @ts-expect-error
  //     handle: {
  //       readStart(...args: any[]) {
  //         console.warn('readStart', args)
  //         return 0
  //       },
  //       readStop() {
  //         console.log('readStop')
  //       },
  //       writeLatin1String(...args: any[]) {
  //         console.log('writeLatin1String', args)
  //         return 0
  //       },
  //       close(...args: any[]) {
  //         console.log('close()', args)
  //       },
  //     },
  //   })

  //   // socket.connect = new Proxy(socket.connect, {
  //   //   apply(target: any, thisArg: any, args: any[]) {
  //   //     console.warn('socket connect', args)

  //   //     /**
  //   //      * @todo Perform request URL match here.
  //   //      * If matches — continue as if connected.
  //   //      * If not — perform actual connection.
  //   //      */
  //   //   },
  //   // })

  //   socket.connect(options as any)

  //   socket.on('error', console.error)

  //   return callback(null, socket)
  // }
}
