import https from 'https'
import http, { ClientRequest } from 'http'
import { Interceptor, RequestMiddleware } from '../../glossary'
import { createClientRequestOverrideClass } from './ClientRequestOverride'

const debug = require('debug')('http override')

type PatchedModules = Record<
  string,
  {
    module: typeof http | typeof https
    request: typeof http['request']
    get: typeof http['get']
  }
>

// Store a pointer to the original `http.ClientRequest` class
// so it can be mutated during runtime, affecting any subsequent calls.
let originalClientRequest: typeof ClientRequest

function handleRequest(
  protocol: string,
  originalMethod: any,
  middleware: RequestMiddleware,
  args: any[]
): ClientRequest {
  if (!originalClientRequest) {
    const ClientRequestOverride = createClientRequestOverrideClass(
      middleware,
      originalMethod,
      originalClientRequest
    )

    debug('patching native http.ClientRequest...')

    // @ts-ignore
    http.ClientRequest = ClientRequestOverride
  }

  debug('new http.ClientRequest (origin: %s)', protocol)

  // @ts-ignore
  return new http.ClientRequest(...args)
}

/**
 * Intercepts requests issued by native `http` and `https` modules.
 */
export const interceptClientRequest: Interceptor = (middleware) => {
  let patchedModules: PatchedModules = {}
  const modules = ['http', 'https']

  modules.forEach((protocol) => {
    const module = protocol === 'https' ? https : http

    const { request: originalRequest, get: originalGet } = module

    // Wrap an original `http.request`/`https.request`
    // so that its invocations can be debugged.
    function proxiedOriginalRequest(...args: any[]) {
      debug('%s.request original call', protocol)

      // @ts-ignore
      return originalRequest(...args)
    }

    debug('patching "%s" module...', protocol)

    // @ts-ignore
    module.request = function requestOverride(...args: any[]) {
      debug('%s.request proxy call', protocol)

      return handleRequest(
        protocol,
        proxiedOriginalRequest.bind(module),
        middleware,
        args
      )
    }

    // @ts-ignore
    module.get = function getOverride(...args: any[]) {
      debug('%s.get call', protocol)

      const req = handleRequest(
        protocol,
        originalGet.bind(module),
        middleware,
        args
      )
      req.end()

      return req
    }

    patchedModules[protocol] = {
      module,
      request: originalRequest,
      get: originalGet,
    }
  })

  return () => {
    debug('restoring patches...')

    Object.values(patchedModules).forEach(({ module, request, get }) => {
      module.request = request
      module.get = get
    })

    patchedModules = {}
  }
}
