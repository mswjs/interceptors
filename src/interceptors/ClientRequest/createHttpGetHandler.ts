import * as http from 'http'
import type { ClientRequestEmitter } from '.'
import { HttpMockAgent } from './MockAgent/HttpMockAgent'
import { HttpsMockAgent } from './MockAgent/HttpsMockAgent'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

export interface HttpGlobalAgent extends http.Agent {
  defaultPort: 443 | 80
  protocol: 'http:' | 'https:'
}

export function createHttpGetHandler(emitter: ClientRequestEmitter) {
  return (
    target: typeof http.get,
    context: typeof http,
    args: Parameters<typeof http.get>
  ) => {
    const globalAgent = context.globalAgent as HttpGlobalAgent
    const [url, options, callback] = normalizeClientRequestArgs(
      globalAgent.protocol,
      ...args
    )

    const MockAgent =
      globalAgent.protocol === 'https:' ? HttpsMockAgent : HttpMockAgent

    const mockAgent = new MockAgent({
      requestUrl: url,
      emitter,
    })

    const nextOptions: http.RequestOptions = {
      ...options,
      /**
       * @todo Respect custom "options.agent" settings.
       * Are those relevant to preserve? Inherit them then.
       */
      agent: mockAgent,
    }

    return Reflect.apply(target, context, [url, nextOptions, callback])
  }
}
