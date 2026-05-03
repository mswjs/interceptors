import { Logger } from '@open-draft/logger'
import { HttpRequestEventMap } from '../../events/http'
import { Interceptor } from '../../interceptor'
import { createXMLHttpRequestProxy } from './XMLHttpRequestProxy'
import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'
import { patchesRegistry } from '../../utils/patchesRegistry'

const logger = new Logger('xhr')

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol.for('xhr-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup() {
    logger.info('patching "XMLHttpRequest"...')

    this.subscriptions.push(
      patchesRegistry.applyPatch(globalThis, 'XMLHttpRequest', () => {
        return createXMLHttpRequestProxy({
          emitter: this.emitter,
          logger,
        })
      })
    )

    logger.info(
      'global "XMLHttpRequest" patched!',
      globalThis.XMLHttpRequest.name
    )
  }
}
