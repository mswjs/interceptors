import { invariant } from 'outvariant'
import { requestContext } from '../../request-context'
import { Interceptor } from '../../Interceptor'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol('xhr-interceptor')

  constructor() {
    super(XMLHttpRequestInterceptor.interceptorSymbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup(): void {
    const RealXMLHttpRequest = globalThis.XMLHttpRequest

    invariant(
      !(RealXMLHttpRequest as any)[IS_PATCHED_MODULE],
      'Failed to patch the "XMLHttpRequest" module: already patched.'
    )

    globalThis.XMLHttpRequest = new Proxy(globalThis.XMLHttpRequest, {
      construct(target, argArray, newTarget) {
        const xmlHttpRequest = Reflect.construct(target, argArray, newTarget)

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

    Object.defineProperty(globalThis.XMLHttpRequest, IS_PATCHED_MODULE, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    this.subscriptions.push(() => {
      Object.defineProperty(globalThis.XMLHttpRequest, IS_PATCHED_MODULE, {
        value: undefined,
      })

      globalThis.XMLHttpRequest = RealXMLHttpRequest
    })
  }
}
