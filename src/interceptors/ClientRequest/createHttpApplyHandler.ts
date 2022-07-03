import * as http from 'http'
import * as https from 'https'
import type { ClientRequestEmitter } from '.'
import { MockAgent } from './MockAgent/MockAgent'
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
    target: typeof http.get | typeof http.request,
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

    const passthrough = () => {
      console.log('constructing bypassed reques', { context, args })
      return Reflect.apply(target, context, args)
    }

    const mockAgent = new MockAgent(emitter, passthrough)

    const nextOptions: http.RequestOptions = Object.assign({}, options, {
      agent: mockAgent,
    })

    return Reflect.apply(target, context, [
      /**
       * @note Always provide the URL string. Certain scenarios
       * cannot handle a URL instance as the input.
       */
      url.href,
      nextOptions,
      callback,
    ])
  }
}
