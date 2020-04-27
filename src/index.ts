import http from 'http'
import { RequestHandler, InterceptionEvent } from './glossary'
import { ClientRequestOverride } from './ClientRequest/ClientRequestOverride'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'

const httpRequestCopy = http.request
const XMLHttpRequestCopy = XMLHttpRequest

export class RequestInterceptor {
  private handlers: RequestHandler[]

  constructor() {
    this.handlers = []

    http.request = (...args: any[]): any => {
      return new ClientRequestOverride(args[0], this.handleRequest)
    }

    // @ts-ignore
    window.XMLHttpRequest = createXMLHttpRequestOverride(this.handleRequest)
  }

  public restore() {
    http.request = httpRequestCopy
    window.XMLHttpRequest = XMLHttpRequestCopy
  }

  public on(event: InterceptionEvent, handler: RequestHandler) {
    this.handlers.push(handler)
  }

  private handleRequest: RequestHandler = (req) => {
    for (let handler of this.handlers) {
      const res = handler(req)

      if (res) {
        return res
      }
    }
  }
}
