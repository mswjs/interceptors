import http from 'http'
import { RequestHandler, InterceptionEvent } from './glossary'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'
import { overrideHttpModule } from './ClientRequest/overrideHttpModule'

const httpRequestCopy = http.request
const XMLHttpRequestCopy = XMLHttpRequest

export class RequestInterceptor {
  private handlers: RequestHandler[]

  constructor() {
    this.handlers = []

    overrideHttpModule(this.handleRequest)

    // @ts-ignore
    window.XMLHttpRequest = createXMLHttpRequestOverride(this.handleRequest)
  }

  /**
   * Removes all the stubs and restores original instances.
   */
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
