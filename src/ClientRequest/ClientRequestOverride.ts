import { Socket } from 'net'
import { IncomingMessage, ClientRequest } from 'http'
import {
  RequestHandler,
  InterceptedRequest,
  ClientRequestInput,
} from '../glossary'
import { createInterceptedRequest } from '../utils/createInterceptedRequest'

export class ClientRequestOverride extends ClientRequest {
  interceptedRequest: InterceptedRequest
  response: IncomingMessage
  handler: RequestHandler

  constructor(input: ClientRequestInput, handler: RequestHandler) {
    super(input)

    this.interceptedRequest = createInterceptedRequest(input, this)
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
