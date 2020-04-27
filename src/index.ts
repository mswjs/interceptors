import http from 'http'
import https from 'https'
import { RequestHandler, InterceptionEvent } from './glossary'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'
import { overrideHttpModule } from './ClientRequest/overrideHttpModule'

const httpRequestCopy = http.request
const httpGetCopy = http.get
const httpsRequestCopy = https.request
const httpsGetCopy = https.get

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
    http.get = httpGetCopy

    https.request = httpsRequestCopy
    https.get = httpsGetCopy
  }

  /**
   * Applies given request interception middleware to any outgoing request.
   */
  public use(handler: RequestHandler) {
    this.handlers.push(handler)
  }

  private handleRequest: RequestHandler = (req, ref) => {
    for (let handler of this.handlers) {
      const res = handler(req, ref)

      if (res) {
        return res
      }
    }
  }
}
