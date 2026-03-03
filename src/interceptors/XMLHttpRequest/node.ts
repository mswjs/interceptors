import { requestContext } from '../../request-context'
import { Interceptor } from '../../Interceptor'
import { HttpRequestEventMap } from '../../glossary'
import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'
import { applyPatch } from '../../utils/apply-patch'

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol.for('xhr-interceptor')

  constructor() {
    super(XMLHttpRequestInterceptor.interceptorSymbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup(): void {
    this.logger.info('patching global "XMLHttpRequest"...')

    this.subscriptions.push(
      applyPatch(globalThis, 'XMLHttpRequest', () => {
        return new Proxy(globalThis.XMLHttpRequest, {
          construct(target, args, newTarget) {
            const xmlHttpRequest = Reflect.construct(target, args, newTarget)

            /**
             * @note Use `.enterWith()` here because XHR in JSDOM is implemented
             * via `http`/`https`. This makes the initiator cascading work properly.
             */
            requestContext.enterWith({ initiator: xmlHttpRequest })

            /**
             * @todo Do we need to exit the async context at some point?
             */

            return xmlHttpRequest
          },
        })
      })
    )

    this.logger.info('global "XMLHttpRequest" patched!')
  }
}
