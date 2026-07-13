import { HttpRequestEventMap } from '../../events/http'
import { Interceptor } from '../../interceptor'
import { createXMLHttpRequestProxy } from './XMLHttpRequestProxy'
import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'
import { patchesRegistry } from '../../utils/patchesRegistry'
import { createLogger } from '../../utils/logger'

const logger = createLogger('xhr')

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('xhr-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup() {
    logger.verbose('patching "XMLHttpRequest"...')

    this.subscriptions.push(
      patchesRegistry.applyPatch(globalThis, 'XMLHttpRequest', () => {
        return createXMLHttpRequestProxy({
          emitter: this.emitter,
          logger,
        })
      })
    )

    logger.verbose(
      'global "XMLHttpRequest" patched!',
      globalThis.XMLHttpRequest.name
    )
  }
}
