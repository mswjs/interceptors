import { Socket } from 'net'
import { inherits } from 'util'
import http, { IncomingMessage, ClientRequest } from 'http'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'
import { RequestHandler } from '../glossary'
import { createInterceptedRequest } from '../utils/createInterceptedRequest'

export function createClientRequestOverrideClass(handler: RequestHandler) {
  function ClientRequestOverride(this: ClientRequest, ...args: any[]) {
    const [url, options, callback] = normalizeHttpRequestParams(...args)

    http.OutgoingMessage.call(this)

    const socket = new Socket()
    const response = new IncomingMessage(socket)
    this.socket = this.connection = socket

    if (options.headers?.expect === '100-continue') {
      this.emit('continue')
    }

    if (callback) {
      this.once('response', callback)
    }

    this.end = async (cb?: () => void) => {
      const formattedRequest = createInterceptedRequest(url, options, this)
      const mockedResponse = await handler(formattedRequest, response)

      if (mockedResponse && !response.complete) {
        const { headers = {} } = mockedResponse

        response.statusCode = mockedResponse.status
        response.headers = Object.entries(headers).reduce<
          Record<string, string | string[]>
        >((acc, [name, value]) => {
          acc[name.toLowerCase()] = value
          return acc
        }, {})

        response.rawHeaders = Object.entries(headers).reduce<string[]>(
          (acc, [name, value]) => {
            return acc.concat(name.toLowerCase()).concat(value)
          },
          []
        )

        if (mockedResponse.body) {
          response.push(Buffer.from(mockedResponse.body))
        }
      } else {
        /**
         * @todo Perform actual request
         */
      }

      this.finished = true
      this.emit('finish')

      // Delegate the ending of response to the request handler
      // to support async logic
      this.emit('response', response)
      response.push(null)
      response.complete = true

      if (cb) {
        cb()
      }
    }
  }

  inherits(ClientRequestOverride, http.ClientRequest)

  return ClientRequestOverride
}
