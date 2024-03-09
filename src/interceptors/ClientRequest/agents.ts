import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { MockHttpSocket } from './MockHttpSocket'

declare module 'node:http' {
  interface Agent {
    createConnection(options: any, callback: any): net.Socket
  }
}

export type MockAgentOnRequestCallback = (args: {
  request: Request
  socket: MockHttpSocket
}) => void

export type MockAgentOnResponseCallback = (args: { response: Response }) => void

interface MockAgentOptions {
  customAgent?: http.RequestOptions['agent']
  onRequest: MockAgentOnRequestCallback
  onResponse: MockAgentOnResponseCallback
}

export class MockAgent extends http.Agent {
  private customAgent?: http.RequestOptions['agent']
  private onRequest: MockAgentOnRequestCallback
  private onResponse: MockAgentOnResponseCallback

  constructor(options: MockAgentOptions) {
    super()
    this.customAgent = options.customAgent
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse
  }

  public createConnection(options: any, callback: any) {
    const createConnection =
      (this.customAgent instanceof http.Agent &&
        this.customAgent.createConnection) ||
      super.createConnection

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(this, options, callback),
      onRequest: (request) => {
        this.onRequest({ request, socket })
      },
      onResponse: (response) => {
        this.onResponse({ response })
      },
    })

    return socket
  }
}

export class MockHttpsAgent extends https.Agent {
  private customAgent?: https.RequestOptions['agent']
  private onRequest: MockAgentOnRequestCallback
  private onResponse: MockAgentOnResponseCallback

  constructor(options: MockAgentOptions) {
    super()
    this.customAgent = options.customAgent
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse
  }

  public createConnection(options: any, callback: any) {
    const createConnection =
      (this.customAgent instanceof https.Agent &&
        this.customAgent.createConnection) ||
      super.createConnection

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(this, options, callback),
      onRequest: (request) => {
        this.onRequest({ request, socket })
      },
      onResponse: (response) => {
        this.onResponse({ response })
      },
    })

    return socket
  }
}
