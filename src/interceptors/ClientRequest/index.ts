import http from 'http'
import https from 'https'
import { Interceptor, Observer, Resolver } from '../../createInterceptor'
import { createClientRequestOverride } from './createClientRequestOverride'

const debug = require('debug')('http override')

type Protocol = 'http' | 'https'
type PureModules = Map<
  Protocol,
  {
    module: typeof http | typeof https
    get: typeof http.get
    request: typeof http.request
  }
>

// Store a pointer to the original `http.ClientRequest` class
// so it can be mutated during runtime, affecting any subsequent calls.
let pureClientRequest: typeof http.ClientRequest

function handleClientRequest(
  protocol: string,
  pureMethod: typeof http.get | typeof http.request,
  args: any[],
  observer: Observer,
  resolver: Resolver
): http.ClientRequest {
  // The first time we execute this, I'll save the original ClientRequest.
  // This because is used to restore the dafault one later
  if (!pureClientRequest) {
    pureClientRequest = http.ClientRequest
  }

  const ClientRequestOverride = createClientRequestOverride({
    defaultProtocol: `${protocol}:`,
    pureClientRequest,
    pureMethod,
    observer,
    resolver,
  })
  
  debug('new ClientRequestOverride (origin: %s)', protocol)

  // @ts-expect-error Variable call signature.
  return new ClientRequestOverride(...args)
}

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
      debug('%s.request original call', protocol)

      // @ts-ignore
      return originalRequest(...args)
    }

    debug('patching "%s" module...', protocol)

    // @ts-ignore
    requestModule.request = function requestOverride(...args: any[]) {
      debug('%s.request proxy call', protocol)

      return handleClientRequest(
        protocol,
        proxiedOriginalRequest.bind(requestModule),
        args,
        observer,
        resolver
      )
    }

    // @ts-ignore
    requestModule.get = function getOverride(...args: any[]) {
      debug('%s.get call', protocol)

      const req = handleClientRequest(
        protocol,
        originalGet.bind(requestModule),
        args,
        observer,
        resolver
      )
      req.end()

      return req
    }

    pureModules.set(protocol, {
      module: requestModule,
      request: originalRequest,
      get: originalGet,
    })
  })

  return () => {
    debug('restoring modules...')

    for (const requestModule of pureModules.values()) {
      requestModule.module.get = requestModule.get
      requestModule.module.request = requestModule.request
    }

    pureModules.clear()
  }
}
