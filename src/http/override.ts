import http, { ClientRequest } from 'http'
import https from 'https'
import {
  ModuleOverride,
  InterceptedRequest,
  RequestMiddleware,
} from '../glossary'
import { createClientRequestOverrideClass } from './ClientRequest/ClientRequestOverride'
import { normalizeHttpRequestParams } from './ClientRequest/normalizeHttpRequestParams'

const debug = require('debug')('http:override')

let originalClientRequest: typeof ClientRequest
let patchedModules: Record<
  string,
  {
    module: any
    request: typeof http['request']
    get: typeof http['get']
  }
> = {}

function handleRequest(
  protocol: string,
  originalMethod: any,
  middleware: RequestMiddleware,
  args: any[]
): Promise<ClientRequest> {
  if (!originalClientRequest) {
    originalClientRequest = http.ClientRequest

    const ClientRequestOverride = createClientRequestOverrideClass(
      protocol,
      middleware,
      originalMethod,
      originalClientRequest
    )

    debug('patching native http.ClientRequest')

    // @ts-ignore
    http.ClientRequest = ClientRequestOverride
  }

  debug('constructing http.ClientRequest', args)

  // @ts-ignore
  return new http.ClientRequest(...args)
}

export const overrideHttpModule: ModuleOverride = (middleware) => {
  const modules: ['http', 'https'] = ['http', 'https']

  modules.forEach((protocol) => {
    const module = ({
      http: require('http'),
      https: require('https'),
    } as Record<string, typeof http | typeof https>)[protocol]

    const { request: originalRequest, get: originalGet } = module

    const originalRequest2 = (...args: any[]) => {
      debug('%s.request ORIGINAL call', protocol)
      // @ts-ignore
      return originalRequest(...args)
    }

    debug('patching "%s" module', protocol)

    // @ts-ignore
    module.request = function (...args: any[]) {
      debug('%s.request call', protocol)
      return handleRequest(
        protocol,
        originalRequest2.bind(module),
        middleware,
        args
      )
    }

    // @ts-ignore
    module.get = function (...args: any[]) {
      debug('%s.get call', protocol)
      return handleRequest(protocol, originalGet.bind(module), middleware, args)
    }

    patchedModules[protocol] = {
      module,
      request: originalRequest,
      get: originalGet,
    }
  })

  return () => {
    debug('reverting patches...')

    Object.entries(patchedModules).forEach(
      ([protocol, { module, request, get }]) => {
        module.request = request
        module.get = get
      }
    )

    patchedModules = {}
  }
}
