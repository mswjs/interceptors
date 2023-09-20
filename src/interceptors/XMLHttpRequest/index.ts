import { invariant } from 'outvariant'
import { Emitter } from 'strict-event-emitter'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { InteractiveRequest } from '../../utils/toInteractiveRequest'
import { Interceptor } from '../../Interceptor'
import { createXMLHttpRequestProxy } from './XMLHttpRequestProxy'

export type XMLHttpRequestEventListener = (args: {
  request: InteractiveRequest
  requestId: string
}) => Promise<void> | void

export type XMLHttpRequestEmitter = Emitter<HttpRequestEventMap>

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol('xhr')

  constructor() {
    super(XMLHttpRequestInterceptor.interceptorSymbol)
  }

  protected checkEnvironment() {
    return typeof globalThis.XMLHttpRequest !== 'undefined'
  }

  protected setup() {
    const logger = this.logger.extend('setup')

    logger.info('patching "XMLHttpRequest" module...')

    const PureXMLHttpRequest = globalThis.XMLHttpRequest

    invariant(
      !(PureXMLHttpRequest as any)[IS_PATCHED_MODULE],
      'Failed to patch the "XMLHttpRequest" module: already patched.'
    )

    globalThis.XMLHttpRequest = createXMLHttpRequestProxy({
      emitter: this.emitter,
      logger: this.logger,
    })

    logger.info(
      'native "XMLHttpRequest" module patched!',
      globalThis.XMLHttpRequest.name
    )

    Object.defineProperty(globalThis.XMLHttpRequest, IS_PATCHED_MODULE, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    this.subscriptions.push(() => {
      Object.defineProperty(globalThis.XMLHttpRequest, IS_PATCHED_MODULE, {
        value: undefined,
      })

      globalThis.XMLHttpRequest = PureXMLHttpRequest
      logger.info(
        'native "XMLHttpRequest" module restored!',
        globalThis.XMLHttpRequest.name
      )
    })
  }
}
