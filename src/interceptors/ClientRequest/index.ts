import http from 'http'
import https from 'https'
import {
  IsomorphicRequest,
  IsomorphicResponse,
  InteractiveIsomorphicRequest,
} from '../../createInterceptor'
import { Interceptor } from '../../Interceptor'
import { AsyncEventEmitter } from '../../utils/AsyncEventEmitter'
import { get } from './http.get'
import { request } from './http.request'
import { NodeClientOptions, Protocol } from './NodeClientRequest'

export type ClientRequestEventListener = (
  request: InteractiveIsomorphicRequest
) => Promise<void> | void

export type ClientRequestEventMap = {
  request: ClientRequestEventListener
  response(
    request: IsomorphicRequest,
    response: IsomorphicResponse
  ): Promise<void> | void
}

export type ClientRequestEmitter = AsyncEventEmitter<ClientRequestEventMap>

export type ClientRequestModules = Map<Protocol, typeof http | typeof https>

/**
 * Intercept requests made via the `ClientRequest` class.
 * Such requests include `http.get`, `https.request`, etc.
 */
export class ClientRequestInterceptor extends Interceptor<ClientRequestEventMap> {
  static symbol = Symbol('http')
  private modules: ClientRequestModules

  constructor() {
    super(ClientRequestInterceptor.symbol)

    this.modules = new Map()
    this.modules.set('http', http)
    this.modules.set('https', https)
  }

  protected setup(): void {
    const log = this.log.extend('setup')

    for (const [protocol, requestModule] of this.modules) {
      const { request: pureRequest, get: pureGet } = requestModule

      this.subscriptions.push(() => {
        requestModule.request = pureRequest
        requestModule.get = pureGet

        this.modules.delete(protocol)

        log('native "%s" module restored!', protocol)
      })

      log('patching the "%s" module...', protocol)

      const options: NodeClientOptions = {
        emitter: this.emitter,
        log: this.log,
      }

      // @ts-ignore
      requestModule.request =
        // Force a line break.
        request(protocol, options)

      log('native "%s.request" function patched!', requestModule.request)

      // @ts-ignore
      requestModule.get =
        // Force a line break.
        get(protocol, options)

      log('native "%s.get" function patched!', requestModule.get)
    }
  }
}
