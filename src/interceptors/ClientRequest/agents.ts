import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import {
  MockHttpSocket,
  type MockHttpSocketRequestCallback,
  type MockHttpSocketResponseCallback,
} from './MockHttpSocket'

declare module 'node:http' {
  interface Agent {
    createConnection(options: any, callback: any): net.Socket
    addRequest(request: http.ClientRequest, options: http.RequestOptions): void
  }
}

interface MockAgentOptions {
  customAgent?: http.RequestOptions['agent']
  onRequest: MockHttpSocketRequestCallback
  onResponse: MockHttpSocketResponseCallback
}

export class MockAgent extends http.Agent {
  private customAgent?: http.RequestOptions['agent']
  private onRequest: MockHttpSocketRequestCallback
  private onResponse: MockHttpSocketResponseCallback

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
      createConnection: createConnection.bind(
        this.customAgent || this,
        options,
        callback
      ),
      onRequest: this.onRequest.bind(this),
      onResponse: this.onResponse.bind(this),
    })

    return socket
  }

  addRequest(request: http.ClientRequest, options: http.RequestOptions) {
    // First, execute the base class method.
    super.addRequest.apply(this, [request, options])

    // If there's a custom HTTP agent, call its `addRequest` method.
    // This way, if the agent has side effects that affect the request,
    // those will be applied to the intercepted request instance as well.
    if (this.customAgent instanceof http.Agent) {
      this.customAgent.addRequest(request, options)
    }
  }
}

export class MockHttpsAgent extends https.Agent {
  private customAgent?: https.RequestOptions['agent']
  private onRequest: MockHttpSocketRequestCallback
  private onResponse: MockHttpSocketResponseCallback

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
      createConnection: createConnection.bind(
        this.customAgent || this,
        options,
        callback
      ),
      onRequest: this.onRequest.bind(this),
      onResponse: this.onResponse.bind(this),
    })

    return socket
  }
}
