import http from 'http'
import https from 'https'
import { Interceptor } from '../../createInterceptor'
import { NodeClientRequest, Protocol } from './NodeClientRequest'

const debug = require('debug')('http override')

type PureModules = Map<
  Protocol,
  {
    module: typeof http | typeof https
    get: typeof http.get
    request: typeof http.request
  }
>

/**
 * Intercepts requests issued by native `http` and `https` modules.
 */
export const interceptClientRequest: Interceptor = (observer, resolver) => {
  const pureModules: PureModules = new Map()
  const modules: Protocol[] = ['http', 'https']

  modules.forEach((protocol) => {
    const requestModule = protocol === 'https' ? https : http
    const { request: originalRequest, get: originalGet } = requestModule

    // Wrap an original `http.request`/`https.request`
    // so that its invocations can be debugged.
    function proxiedOriginalRequest(...args: any[]) {
      debug('original "%s.request" call', protocol, args)

      // @ts-ignore
      return originalRequest(...args)
    }

    debug('patching "%s" module...', protocol)

    // @ts-ignore
    requestModule.request = function requestOverride(
      ...args: Parameters<typeof http.request>
    ) {
      debug('intercepted "%s.request" call', protocol, new Error().stack)

      return new NodeClientRequest({
        defaultProtocol: protocol,
        originalMethod: proxiedOriginalRequest.bind(requestModule),
        resolver,
        observer,
        requestOptions: args,
      })
    }

    // @ts-ignore
    requestModule.get = function getOverride(
      ...args: Parameters<typeof http.get>
    ) {
      debug('intercepted "%s.get" call', protocol, new Error().stack)

      const request = new NodeClientRequest({
        defaultProtocol: protocol,
        originalMethod: originalGet.bind(requestModule),
        resolver,
        observer,
        requestOptions: args,
      })

      /**
       * @note https://nodejs.org/api/http.html#httpgetoptions-callback
       * "http.get" sets the method to "GET" and calls "req.end()" automatically.
       */
      request.end()

      return request
    }

    pureModules.set(protocol, {
      module: requestModule,
      request: originalRequest,
      get: originalGet,
    })
  })

  return () => {
    debug('done, restoring modules...')

    for (const requestModule of pureModules.values()) {
      requestModule.module.get = requestModule.get
      requestModule.module.request = requestModule.request
    }

    pureModules.clear()
  }
}
