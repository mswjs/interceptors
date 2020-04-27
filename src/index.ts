import http from 'http'
import https from 'https'
import { RequestHandler } from './glossary'
import { overrideHttpModule } from './ClientRequest/overrideHttpModule'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'

const httpRequestCopy = http.request
const httpGetCopy = http.get
const httpsRequestCopy = https.request
const httpsGetCopy = https.get
const xmlHttpRequestCopy = window?.XMLHttpRequest

export class RequestInterceptor {
  private isBrowserLikeEnvironment: boolean
  private handlers: RequestHandler[]

  constructor() {
    this.isBrowserLikeEnvironment = typeof window !== 'undefined'
    this.handlers = []

    overrideHttpModule(this.handleRequest)

    if (this.isBrowserLikeEnvironment) {
      // @ts-ignore
      window.XMLHttpRequest = createXMLHttpRequestOverride(this.handleRequest)
    }
  }

  /**
   * Removes all the stubs and restores original instances.
   */
  public restore() {
    http.request = httpRequestCopy
    http.get = httpGetCopy

    https.request = httpsRequestCopy
    https.get = httpsGetCopy

    if (this.isBrowserLikeEnvironment) {
      window.XMLHttpRequest = xmlHttpRequestCopy
    }
  }

  /**
   * Applies given request interception middleware to any outgoing request.
   */
  public use(handler: RequestHandler) {
    this.handlers.push(handler)
  }

  private handleRequest: RequestHandler = async (req, ref) => {
    for (let handler of this.handlers) {
      const res = await handler(req, ref)

      if (res) {
        return res
      }
    }
  }
}
