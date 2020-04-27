import http, { IncomingMessage } from 'http'
import https from 'https'
import { RequestHandler } from '../glossary'
import { ClientRequestOverride } from './ClientRequestOverride'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'
import { inherits } from 'util'
import { createInterceptedRequest } from '../utils/createInterceptedRequest'

export const overrideHttpModule = (requestHandler: RequestHandler) => {
  inherits(ClientRequestOverride, http.ClientRequest)

  // @ts-ignore
  // Override native `ClientRequest` instance, because it's used in both
  // `http.request` and `https.request`.
  http.ClientRequest = ClientRequestOverride

  const httpRequest = (...args: any[]) => {
    const [url, options, callback] = normalizeHttpRequestParams(...args)

    const req = new http.ClientRequest(
      url,
      options,
      // @ts-ignore
      (res: IncomingMessage) => {
        const formattedRequest = createInterceptedRequest(url, options, req)
        const mockedResponse = requestHandler(formattedRequest)

        if (mockedResponse) {
          const { headers = {} } = mockedResponse

          res.statusCode = mockedResponse.status
          res.headers = Object.entries(headers).reduce<Record<string, string>>(
            (acc, [name, value]) => {
              acc[name.toLowerCase()] = value
              return acc
            },
            {}
          )
          res.rawHeaders = Object.entries(headers).reduce<string[]>(
            (acc, [name, value]) => {
              return acc.concat([name.toLowerCase(), value])
            },
            []
          )

          if (mockedResponse.body) {
            res.push(Buffer.from(mockedResponse.body))
          }
        }

        if (callback) {
          callback(res)
        }
      }
    )

    return req
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
