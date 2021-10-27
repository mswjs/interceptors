import { debug } from 'debug'
import http from 'http'
import https from 'https'
import { Interceptor } from '../../createInterceptor'
import { get } from './http.get'
import { Protocol } from './NodeClientRequest'
import { request } from './http.request'

const log = debug('http override')

export type RequestModule = typeof http | typeof https
type PureModules = Map<
  Protocol,
  {
    module: RequestModule
    get: typeof http.get
    request: typeof http.request
  }
>

/**
 * Intercepts requests issued by native "http" and "https" modules.
 */
export const interceptClientRequest: Interceptor = (observer, resolver) => {
  const pureModules: PureModules = new Map()
  const modules: [Protocol, RequestModule][] = [
    ['http', http],
    ['https', https],
  ]

  for (const [protocol, requestModule] of modules) {
    log('patching the "%s" module...', protocol)

    pureModules.set(protocol, {
      module: requestModule,
      request: requestModule.request,
      get: requestModule.get,
    })

    // @ts-ignore Call signature overloads are incompatible.
    requestModule.request =
      // Force a line-break to prevent ignoring the "request" call.
      request(protocol, resolver, observer)

    // @ts-ignore Call signature overloads are incompatible.
    requestModule.get =
      // Force a line-break to prevent ignoring the "get" call.
      get(protocol, resolver, observer)
  }

  return () => {
    log('done, restoring modules...')

    for (const requestModule of pureModules.values()) {
      requestModule.module.get = requestModule.get
      requestModule.module.request = requestModule.request
    }

    pureModules.clear()
  }
}
