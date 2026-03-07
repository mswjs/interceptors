import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { applyPatch } from '#/src/utils/apply-patch'
import { Interceptor } from '#/src/Interceptor'
import { HttpRequestEventMap } from '#/src/glossary'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { emitAsync } from '#/src/utils/emitAsync'

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('xhr-interceptor')

  constructor() {
    super(XMLHttpRequestInterceptor.symbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup(): void {
    const httpInterceptor = new HttpRequestInterceptor()

    httpInterceptor.apply()
    this.subscriptions.push(() => httpInterceptor.dispose())

    httpInterceptor
      .on('request', async (args) => {
        if (args.initiator instanceof XMLHttpRequest) {
          await emitAsync(this.emitter, 'request', args)
        }
      })
      .on('response', async (args) => {
        if (args.initiator instanceof XMLHttpRequest) {
          await emitAsync(this.emitter, 'response', args)
        }
      })

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
