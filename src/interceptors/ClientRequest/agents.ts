import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import {
  kEmitter,
  MockHttpSocket,
  MockHttpSocketRequestCallback,
  MockHttpSocketResponseCallback,
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

export class DefaultMockAgent extends http.Agent {
  public addRequest(
    request: http.ClientRequest,
    options: http.RequestOptions
  ): void {
    this.createConnection(request, () => {})
  }

  public createConnection(
    options: http.RequestOptions,
    callback: (...args: any[]) => void
  ): net.Socket {
    // Create a passthrough socket.
    return new MockHttpSocket({
      connectionOptions: options,
      createConnection: super.createConnection.bind(this, options, callback),
    })
  }
}

export class DefaultMockHttpsAgent extends https.Agent {
  public addRequest(
    request: http.ClientRequest,
    options: http.RequestOptions
  ): void {
    this.createConnection(request, () => {})
  }

  public createConnection(
    options: http.RequestOptions,
    callback: (...args: any[]) => void
  ): net.Socket {
    // Create a passthrough socket.
    return new MockHttpSocket({
      connectionOptions: options,
      createConnection: super.createConnection.bind(this, options, callback),
    })
  }
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
      (this.customAgent &&
        this.customAgent instanceof http.Agent &&
        this.customAgent.createConnection.bind(this.customAgent)) ||
      super.createConnection

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(
        this.customAgent || this,
        options,
        callback
      ),
    })

    // Forward requests and responses from this socket
    // to the interceptor and the end user.
    socket[kEmitter].on('request', this.onRequest)
    socket[kEmitter].on('response', this.onResponse)

    return socket
  }

  public addRequest(request: http.ClientRequest, options: http.RequestOptions) {
    // If there's a custom HTTP agent, call its `addRequest` method.
    // This way, if the agent has side effects that affect the request,
    // those will be applied to the intercepted request instance as well.
    if (this.customAgent && this.customAgent instanceof DefaultMockAgent) {
      this.customAgent.addRequest(request, options)
    }

    // Call the original `addRequest` method to trigger the request flow:
    // addRequest -> createSocket -> createConnection.
    // Without this, the socket will pend forever.
    return super.addRequest(request, options)
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
      (this.customAgent &&
        this.customAgent instanceof http.Agent &&
        this.customAgent.createConnection.bind(this.customAgent)) ||
      super.createConnection

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(
        this.customAgent || this,
        options,
        callback
      ),
    })

    // Forward requests and responses from this socket
    // to the interceptor and the end user.
    socket[kEmitter].on('request', this.onRequest)
    socket[kEmitter].on('response', this.onResponse)

    return socket
  }

  public addRequest(request: http.ClientRequest, options: http.RequestOptions) {
    if (this.customAgent && this.customAgent instanceof DefaultMockHttpsAgent) {
      this.customAgent.addRequest(request, options)
    }

    return super.addRequest(request, options)
  }
}
