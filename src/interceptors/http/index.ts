import { Interceptor } from '#/src/interceptor'
import { type HttpRequestEventMap } from '#/src/events/http'
import { forwardHttpEvents } from './forward-events'
import { NodeHttpRequestSource } from './source'

/**
 * Interceptor for all HTTP requests in Node.js.
 */
export class HttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('http-request-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    const requestSource = Interceptor.singleton(NodeHttpRequestSource)
    requestSource.apply(this)

    this.subscriptions.push(() => {
      requestSource.dispose(this)
    })

    this.subscriptions.push(
      forwardHttpEvents({
        source: requestSource,
        emitter: this.emitter,
        predicate: () => {
          return true
        },
      })
    )
  }
}
