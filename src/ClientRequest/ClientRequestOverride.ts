import { Socket } from 'net'
import { IncomingMessage, ClientRequest, RequestOptions } from 'http'
import {
  RequestHandler,
  InterceptedRequest,
  HttpRequestCallback,
} from '../glossary'
import { createInterceptedRequest } from '../utils/createInterceptedRequest'

export class ClientRequestOverride extends ClientRequest {
  interceptedRequest: InterceptedRequest
  response: IncomingMessage
  handler: RequestHandler

  constructor(
    handler: RequestHandler,
    url: URL,
    options: RequestOptions,
    callback?: HttpRequestCallback
  ) {
    super(options, callback)

    this.interceptedRequest = createInterceptedRequest(url, options, this)
    this.handler = handler

    const socket = new Socket()
    this.response = new IncomingMessage(socket)
  }

  async end() {
    const mockedResponse = this.handler(this.interceptedRequest)

    if (mockedResponse) {
      const { headers = {} } = mockedResponse

      this.response.statusCode = mockedResponse.status
      this.response.headers = headers
      this.response.rawHeaders = Object.entries(headers).reduce<string[]>(
        (acc, [name, value]) => {
          return acc.concat([name, value])
        },
        []
      )

      if (mockedResponse.body) {
        this.response.push(Buffer.from(mockedResponse.body))
      }
    }

    // Mark request as finished
    this.finished = true
    this.emit('finish')
    this.emit('response', this.response)

    // End the response
    this.response.push(null)
    this.response.complete = true
  }
}
