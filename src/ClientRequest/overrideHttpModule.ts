import http, { IncomingMessage } from 'http'
import https from 'https'
import { RequestHandler } from '../glossary'
import { create } from './ClientRequestOverride'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'
import { inherits } from 'util'

export const overrideHttpModule = (requestHandler: RequestHandler) => {
  const ClientRequestOverride = create(requestHandler)

  inherits(ClientRequestOverride, http.ClientRequest)

  // @ts-ignore
  // Override native `ClientRequest` instance, because it's used in both
  // `http.request` and `https.request`.
  http.ClientRequest = ClientRequestOverride

  const httpRequest = (...args: any[]) => {
    const [url, options, callback] = normalizeHttpRequestParams(...args)
    return new http.ClientRequest(options, callback)
  }

  const handleGet = (...args: any[]) => {
    const req = httpRequest(...args)
    req.end()
    return req
  }

  http.request = httpRequest
  http.get = handleGet

  https.request = httpRequest
  https.get = handleGet
}
