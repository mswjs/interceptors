import http from 'http'
import https from 'https'
import type { Emitter } from 'strict-event-emitter'
import { HttpRequestEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { get } from './http.get'
import { request } from './http.request'
import { NodeClientOptions, Protocol } from './NodeClientRequest'

export type ClientRequestEmitter = Emitter<HttpRequestEventMap>

export type ClientRequestModules = Map<Protocol, typeof http | typeof https>

/**
 * Intercept requests made via the `ClientRequest` class.
 * Such requests include `http.get`, `https.request`, etc.
 */
export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static interceptorSymbol = Symbol('http')
  private modules: ClientRequestModules

  constructor() {
    super(ClientRequestInterceptor.interceptorSymbol)

    this.modules = new Map()
    this.modules.set('http', http)
    this.modules.set('https', https)
  }

  protected setup(): void {
    const logger = this.logger.extend('setup')

    for (const [protocol, requestModule] of this.modules) {
      const { request: pureRequest, get: pureGet } = requestModule

      this.subscriptions.push(() => {
        requestModule.request = pureRequest
        requestModule.get = pureGet

        logger.info('native "%s" module restored!', protocol)
      })

      const options: NodeClientOptions = {
        emitter: this.emitter,
        logger: this.logger,
      }

      // @ts-ignore
      requestModule.request =
        // Force a line break.
        request(protocol, options)

      // @ts-ignore
      requestModule.get =
        // Force a line break.
        get(protocol, options)

      logger.info('native "%s" module patched!', protocol)
    }
  }
}
