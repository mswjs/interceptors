/**
 * @todo @roadmap
 * 1. Consider what is better: extend "http.Agent"/"https.Agent" to preserve
 * the actual agent behavior (+ support custom agent options) or to keep this
 * plain Agent that disregards those options.
 *
 * PROS:
 * - Respect default agent behaviors.
 * - Support custom agent options.
 * - Have "this.next()" to perform the original request because the default
 * agent knows how to perform it, this plain Agent doesn't.
 *
 * CONS:
 * - The agent needs to be constructed conditionally in "apply" handler.
 *
 * 2. Abstract the entire request handling into a class. This will rid Agent
 * of having to share "requestId"/"request" all the time across different methods.
 */
import * as http from 'http'
import { Socket } from 'net'
import { debug } from 'debug'
import type { ClientRequestEmitter } from '..'
import { RequestHandler } from './RequestHandler'

const log = debug('mock-agent')

export class MockAgent implements http.Agent {
  public readonly requests: Record<string, http.IncomingMessage[]>
  public readonly sockets: Record<string, Socket[]>
  public readonly freeSockets: Record<string, Socket[]>
  public maxSockets: number
  public maxFreeSockets: number
  public maxTotalSockets: number

  private handlers: RequestHandler[]

  constructor(
    private readonly emitter: ClientRequestEmitter,
    private passthrough: () => http.ClientRequest
  ) {
    this.requests = {}
    this.sockets = {}
    this.freeSockets = {}
    this.maxSockets = Infinity
    this.maxFreeSockets = Infinity
    this.maxTotalSockets = Infinity

    this.handlers = []

    log('constructed')
  }

  addRequest(request: http.ClientRequest, options: http.RequestOptions) {
    log('add request:', request.method, request.path)

    const handler = new RequestHandler(
      request,
      options,
      this.emitter,
      this.passthrough
    )

    handler.handle()
  }

  destroy() {
    for (const handler of this.handlers) {
      handler.destroy()
    }
  }
}
