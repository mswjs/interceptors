import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
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

interface MockAgentInterface {
  onRequest?: MockAgentOnRequestCallback
  onResponse?: MockAgentOnResponseCallback
}

export class MockAgent extends http.Agent implements MockAgentInterface {
  public onRequest?: MockAgentOnRequestCallback
  public onResponse?: MockAgentOnResponseCallback

  constructor(options?: http.AgentOptions) {
    super(options)
  }

  public createConnection(options: any, callback: any) {
    const createConnection = super.createConnection.bind(
      this,
      options,
      callback
    )

    const socket = new MockHttpSocket({
      connectionOptions: options,
      createConnection,
      onRequest: (request) => {
        this.onRequest?.({ request, socket })
      },
      onResponse: (response) => {
        this.onResponse?.({ response })
      },
    })

    return socket
  }
}

export class MockHttpsAgent extends https.Agent implements MockAgentInterface {
  public onRequest?: MockAgentOnRequestCallback
  public onResponse?: MockAgentOnResponseCallback

  // TODO: The same implementation as for the HTTP.
  // Just need to extend Https.Agent.
}
