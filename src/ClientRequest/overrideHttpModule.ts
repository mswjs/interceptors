import http, { IncomingMessage } from 'http'
import https from 'https'
import { RequestHandler } from '../glossary'
import { createClientRequestOverrideClass } from './ClientRequestOverride'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'
import { inherits } from 'util'

export const overrideHttpModule = (requestHandler: RequestHandler) => {
  // Generating the class so that the request handling is performed
  // as a part of that class. Performing it in a callback method results
  // into race conditions between response set and response already written.
  const ClientRequestOverride = createClientRequestOverrideClass(requestHandler)

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
