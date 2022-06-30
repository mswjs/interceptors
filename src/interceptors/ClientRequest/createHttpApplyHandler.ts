import * as http from 'http'
import * as https from 'https'
import type { ClientRequestEmitter } from '.'
import { HttpMockAgent } from './MockAgent/HttpMockAgent'
import { HttpsMockAgent } from './MockAgent/HttpsMockAgent'
import { MockAgent } from './MockAgent/MockAgent'
import { NodeClientRequest } from './NodeClientRequest'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

export interface HttpGlobalAgent extends http.Agent {
  defaultPort: 443 | 80
  protocol: 'http:' | 'https:'
}

/**
 * Create the "apply" Proxy handler for the `http.get`/`http.request`
 * method calls.
 */
export function createHttpApplyHandler(
  emitter: ClientRequestEmitter,
  log: any
) {
  return function (
    this: typeof http | typeof https,
    target: typeof http.get,
    context: typeof http | typeof https,
    args: Parameters<typeof http.get>
  ) {
    // Third-party libraries that utilize "http" (like "node-fetch")
    // may not bind the "http.get" calls to the "http" module.
    // Use the explicit context from the interceptor.
    const globalAgent = this.globalAgent as HttpGlobalAgent
    const [url, options, callback] = normalizeClientRequestArgs(
      globalAgent.protocol,
      ...args
    )

    // const MockAgent =
    //   globalAgent.protocol === 'https:' ? HttpsMockAgent : HttpMockAgent

    const customAgentOptions =
      options.agent instanceof http.Agent
        ? // @ts-expect-error
          options.agent.options
        : undefined

    const agent = new MockAgent(emitter)

    // const mockAgent = new MockAgent(
    //   {
    //     requestUrl: url,
    //     emitter,
    //   },
    //   customAgentOptions
    // )

    const nextOptions: http.RequestOptions = Object.assign({}, options, {
      agent,
    })

    console.log('called native "%s.%s()"', globalAgent.protocol, target.name)

    // const request = new NodeClientRequest([url, nextOptions, callback], {
    //   emitter,
    //   log,
    // })
    // return request

    return Reflect.apply(target, context, [
      /**
       * @note Always provide the URL string. Certain scenarios
       * cannot handle `URL` instance as the input.
       */
      url.href,
      nextOptions,
      callback,
    ])
  }
}
