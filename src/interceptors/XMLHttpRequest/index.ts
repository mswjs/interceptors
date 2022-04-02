import type {
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../createInterceptor'
import { Interceptor } from '../../Interceptor'
import { AsyncEventEmitter } from '../../utils/AsyncEventEmitter'
import { createXMLHttpRequestOverride } from './XMLHttpRequestOverride'

export type XMLHttpRequestEventListener = (
  request: InteractiveIsomorphicRequest
) => Promise<void> | void

export type XMLHttpRequestEventMap = {
  request: XMLHttpRequestEventListener
  response(request: IsomorphicRequest, response: IsomorphicResponse): void
}

export type XMLHttpRequestEmitter = AsyncEventEmitter<XMLHttpRequestEventMap>

export class XMLHttpRequestInterceptor extends Interceptor<XMLHttpRequestEventMap> {
  static symbol = Symbol('xhr')

  constructor() {
    super(XMLHttpRequestInterceptor.symbol)
  }

  protected checkEnvironment() {
    return (
      typeof window !== 'undefined' &&
      typeof window.XMLHttpRequest !== 'undefined'
    )
  }

  protected setup() {
    const log = this.log.extend('setup')

    log('patching "XMLHttpRequest" module...')

    const PureXMLHttpRequest = window.XMLHttpRequest

    window.XMLHttpRequest = createXMLHttpRequestOverride({
      XMLHttpRequest: PureXMLHttpRequest,
      emitter: this.emitter,
      log: this.log,
    })

    log('native "XMLHttpRequest" module patched!', window.XMLHttpRequest.name)

    this.subscriptions.push(() => {
      window.XMLHttpRequest = PureXMLHttpRequest
      log(
        'native "XMLHttpRequest" module restored!',
        window.XMLHttpRequest.name
      )
    })
  }
}
