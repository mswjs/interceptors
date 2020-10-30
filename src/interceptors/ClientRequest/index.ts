import http from 'http'
import https from 'https'
import { Interceptor, RequestMiddleware } from '../../glossary'
import { createClientRequestOverrideClass } from './ClientRequestOverride'

const debug = require('debug')('http override')

type PatchedModules = Record<
  string,
  {
    requestModule: typeof http | typeof https
    request: typeof http.request
    get: typeof http.get
  }
>

// Store a pointer to the original `http.ClientRequest` class
// so it can be mutated during runtime, affecting any subsequent calls.
let originalClientRequest: typeof http.ClientRequest

function handleRequest(
  protocol: string,
  originalMethod: any,
  middleware: RequestMiddleware,
  args: any[]
): http.ClientRequest {
  //The first time we execute this, I'll save the original ClientRequest.
  //This because is used to restore the dafault one later
  if (!originalClientRequest) {
    originalClientRequest = http.ClientRequest
  }

  const ClientRequestOverride = createClientRequestOverrideClass(
    protocol,
    middleware,
    originalMethod,
    originalClientRequest
  )
  debug('patching native http.ClientRequest...')
  //Only http.ClientRequest is overridden because https uses http
  //@ts-ignore
  http.ClientRequest = ClientRequestOverride

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

      return handleRequest(
        protocol,
        proxiedOriginalRequest.bind(requestModule),
        middleware,
        args
      )
    }

    // @ts-ignore
    requestModule.get = function getOverride(...args: any[]) {
      debug('%s.get call', protocol)

      const req = handleRequest(
        protocol,
        originalGet.bind(requestModule),
        middleware,
        args
      )
      req.end()

      return req
    }

    patchedModules[protocol] = {
      requestModule,
      request: originalRequest,
      get: originalGet,
    }
  })

  return () => {
    debug('restoring patches...')

    Object.values(patchedModules).forEach(({ requestModule, request, get }) => {
      requestModule.request = request
      requestModule.get = get
    })

    patchedModules = {}
  }
}
