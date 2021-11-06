import { Agent, ClientRequest } from 'http'
import { Socket, SocketConnectOpts, SocketConstructorOpts } from 'net'

export interface InternalAgent extends Agent {
  getName(options: SocketConstructorOpts): string
  createConnection(
    options: SocketConnectOpts,
    cb?: (...args: any[]) => void
  ): void
  addRequest(req: ClientRequest, options: SocketConstructorOpts): void
}

export function prepareAgent(agent: Agent): void {
  const _agent = agent as InternalAgent

  _agent.createConnection = (options, cb) => {
    const socket = new Socket(options as any)
    // socket.connect(options)
    cb?.(null, socket)
  }

  // _agent.addRequest = (req, options) => {
  //   console.log(options)
  //   const name = _agent.getName(options)

  //   const socket = new SuperSocket(options, req)
  //   req.onSocket(socket)

  //   // @ts-ignore
  //   _agent.sockets[name] = socket

  //   // @ts-ignore
  //   _agent.requests[name] = req
  // }

  // @ts-ignore
  // agent.addRequest = function (req, options) {
  //   console.log('AGENT.addRequest', { req, options })
  //   // @ts-ignore
  //   const name = this.getName(options)
  //   Object.defineProperty(this.sockets, name, {
  //     enumerable: true,
  //     value: 'foo',
  //   })
  //   console.log({ agent })
  // }
}
