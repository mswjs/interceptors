import http from 'http'
import { ClientRequestOverride } from './ClientRequestOverride'
import {
  RequestHandler,
  InterceptionEvent,
  InterceptedRequest,
} from './glossary'

const httpRequestCopy = http.request

export class RequestInterceptor {
  private handlers: RequestHandler[]

  constructor() {
    this.handlers = []

    http.request = (...args: any[]): any => {
      return new ClientRequestOverride(args[0], this.handleRequest)
    }
  }

  public restore() {
    http.request = httpRequestCopy
  }

  public on(event: InterceptionEvent, handler: RequestHandler) {
    this.handlers.push(handler)
  }

  private handleRequest = (req: InterceptedRequest) => {
    this.handlers.forEach((handler) => {
      handler(req)
    })
  }
}
