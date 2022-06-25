import * as http from 'http'
import * as https from 'https'
import type { ClientRequestEmitter } from '..'
import { handleRequest } from './handleRequest'
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
  public requestUrl: URL
  public emitter: ClientRequestEmitter

  public next: (
    request: http.ClientRequest,
    options?: https.RequestOptions
  ) => void

  constructor(mockOptions: MockAgentOptions, options?: https.AgentOptions) {
    super(options)
    // Prevent request rejections when requesting unauthorized SSL domains.
    this.options.rejectUnauthorized = false

    this.requestUrl = mockOptions.requestUrl
    this.emitter = mockOptions.emitter

    this.next = https.Agent.prototype.addRequest.bind(this)
  }

  async addRequest(
    request: http.ClientRequest,
    options?: https.RequestOptions
  ): Promise<void> {
    return handleRequest.call(this, request, options)
  }
}
