import * as http from 'http'
import type { ClientRequestEmitter } from '..'
import { RequestHandler } from './RequestHandler'

declare module 'http' {
  interface Agent {
    addRequest(request: http.ClientRequest, options?: http.RequestOptions): void
  }
}

export interface MockAgentOptions {
  emitter: ClientRequestEmitter
}

export interface MockAgent {
  passthrough(request: http.ClientRequest, options?: http.RequestOptions): void
}

export class HttpMockAgent extends http.Agent implements MockAgent {
  public emitter: ClientRequestEmitter

  constructor(mockOptions: MockAgentOptions, options?: http.AgentOptions) {
    super(options)
    this.emitter = mockOptions.emitter
  }

  public passthrough(
    request: http.ClientRequest,
    options?: http.RequestOptions
  ): void {
    // @ts-expect-error
    delete request.socket

    console.log('calling native prototype add Request')
    return http.Agent.prototype.addRequest.apply(this, [request, options])
  }

  async addRequest(
    request: http.ClientRequest,
    options: http.RequestOptions
  ): Promise<void> {
    const handler = new RequestHandler(
      request,
      options,
      this.emitter,
      () => ({} as any)
    )

    handler.handle()
  }
}
