import { Emitter } from 'strict-event-emitter'
import { HttpRequestEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { createXMLHttpRequestProxy } from './XMLHttpRequestProxy'
import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'
import { applyPatch } from '../../utils/apply-patch'

export type XMLHttpRequestEmitter = Emitter<HttpRequestEventMap>

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol.for('xhr-interceptor')

  constructor() {
    super(XMLHttpRequestInterceptor.interceptorSymbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup() {
    const logger = this.logger.extend('setup')

    logger.info('patching "XMLHttpRequest"...')

    this.subscriptions.push(
      applyPatch(globalThis, 'XMLHttpRequest', () => {
        return createXMLHttpRequestProxy({
          emitter: this.emitter,
          logger: this.logger,
        })
      })
    )

    logger.info(
      'global "XMLHttpRequest" patched!',
      globalThis.XMLHttpRequest.name
    )
  }
}
