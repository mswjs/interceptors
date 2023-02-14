import { invariant } from 'outvariant'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { InteractiveRequest } from '../../utils/toInteractiveRequest'
import { Interceptor } from '../../Interceptor'
import { AsyncEventEmitter } from '../../utils/AsyncEventEmitter'
import { createXMLHttpRequestProxy } from './XMLHttpRequestProxy'

export type XMLHttpRequestEventListener = (
  request: InteractiveRequest,
  requestId: string
) => Promise<void> | void

export type XMLHttpRequestEmitter = AsyncEventEmitter<HttpRequestEventMap>

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('xhr')

  constructor() {
    super(XMLHttpRequestInterceptor.symbol)
  }

  protected checkEnvironment() {
    return typeof globalThis.XMLHttpRequest !== 'undefined'
  }

  protected setup() {
    const log = this.log.extend('setup')

    log('patching "XMLHttpRequest" module...')

    const PureXMLHttpRequest = globalThis.XMLHttpRequest

    invariant(
      !(PureXMLHttpRequest as any)[IS_PATCHED_MODULE],
      'Failed to patch the "XMLHttpRequest" module: already patched.'
    )

    globalThis.XMLHttpRequest = createXMLHttpRequestProxy(this.emitter)

    log(
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
      log(
        'native "XMLHttpRequest" module restored!',
        globalThis.XMLHttpRequest.name
      )
    })
  }
}
