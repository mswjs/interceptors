import http from 'http'
import { RequestHandler } from '../glossary'
import { ClientRequestOverride } from './ClientRequestOverride'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'

export const overrideHttpModule = (requestHandler: RequestHandler) => {
  const httpRequest = (...args: any[]) => {
    const [url, options, callback] = normalizeHttpRequestParams(...args)
    return new ClientRequestOverride(requestHandler, url, options, callback)
  }

  http.request = httpRequest
}
