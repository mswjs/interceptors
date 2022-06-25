import * as http from 'http'
import type { ClientRequestEmitter } from '..'
import { handleRequest } from './handleRequest'

declare module 'http' {
  interface Agent {
    addRequest(request: http.ClientRequest, options?: http.RequestOptions): void
  }
}

export interface MockAgentOptions {
  requestUrl: URL
  emitter: ClientRequestEmitter
}

export class HttpMockAgent extends http.Agent {
  public requestUrl: URL
  public emitter: ClientRequestEmitter

  public next: (
    request: http.ClientRequest,
    options?: http.RequestOptions
  ) => void

  constructor(mockOptions: MockAgentOptions, options?: http.AgentOptions) {
    super(options)
    this.requestUrl = mockOptions.requestUrl
    this.emitter = mockOptions.emitter

    this.next = http.Agent.prototype.addRequest.bind(this)
  }

  async addRequest(
    request: http.ClientRequest,
    options?: http.RequestOptions
  ): Promise<void> {
    return handleRequest.call(this, request, options)
  }
}
