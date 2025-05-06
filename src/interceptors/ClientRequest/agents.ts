import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import {
  MockHttpSocket,
  type MockHttpSocketRequestCallback,
  type MockHttpSocketResponseCallback,
} from './MockHttpSocket'

declare module 'node:http' {
  interface Agent {
    options?: http.AgentOptions
    createConnection(options: any, callback: any): net.Socket
  }
}

interface MockAgentOptions {
  customAgent?: http.RequestOptions['agent']
  onRequest: MockHttpSocketRequestCallback
  onResponse: MockHttpSocketResponseCallback
  socketPath?: string // Unix socket path when connecting to a socket
}

export class MockAgent extends http.Agent {
  private customAgent?: http.RequestOptions['agent']
  private onRequest: MockHttpSocketRequestCallback
  private onResponse: MockHttpSocketResponseCallback
  private socketPath?: string

  constructor(options: MockAgentOptions) {
    super()
    this.customAgent = options.customAgent
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse
    this.socketPath = options.socketPath
  }

  public createConnection(options: any, callback: any): net.Socket {
    // Ensure socketPath is passed to connection options if specified
    if (this.socketPath) {
      options.socketPath = this.socketPath
    }

    const createConnection =
      this.customAgent instanceof http.Agent
        ? this.customAgent.createConnection
        : super.createConnection

    const createConnectionOptions =
      this.customAgent instanceof http.Agent
        ? {
            ...options,
            ...this.customAgent.options,
          }
        : options

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(
        this.customAgent || this,
        createConnectionOptions,
        callback
      ),
      onRequest: this.onRequest.bind(this),
      onResponse: this.onResponse.bind(this),
    })

    return socket
  }
}

export class MockHttpsAgent extends https.Agent {
  private customAgent?: https.RequestOptions['agent']
  private onRequest: MockHttpSocketRequestCallback
  private onResponse: MockHttpSocketResponseCallback
  private socketPath?: string

  constructor(options: MockAgentOptions) {
    super()
    this.customAgent = options.customAgent
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse
    this.socketPath = options.socketPath
  }

  public createConnection(options: any, callback: any): net.Socket {
    // If socketPath is specified, ensure it's passed to the connection options
    if (this.socketPath) {
      options.socketPath = this.socketPath
    }

    const createConnection =
      this.customAgent instanceof https.Agent
        ? this.customAgent.createConnection
        : super.createConnection

    const createConnectionOptions =
      this.customAgent instanceof https.Agent
        ? {
            ...options,
            ...this.customAgent.options,
          }
        : options

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection: createConnection.bind(
        this.customAgent || this,
        createConnectionOptions,
        callback
      ),
      onRequest: this.onRequest.bind(this),
      onResponse: this.onResponse.bind(this),
    })

    return socket
  }
}
