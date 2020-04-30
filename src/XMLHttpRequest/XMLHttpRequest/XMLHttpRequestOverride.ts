/**
 * XMLHttpRequest override class.
 * Inspired by https://github.com/marvinhagemeister/xhr-mocklet
 */
import { RequestMiddleware, InterceptedRequest } from '../../glossary'
import { createEvent } from './createEvent'
import { flattenHeadersObject } from '../../utils/flattenHeadersObject'

const debug = require('debug')('XMLHttpRequestOverride')

export const createXMLHttpRequestOverride = (
  middleware: RequestMiddleware,
  XMLHttpRequestPristine: typeof window.XMLHttpRequest
) => {
  return class XMLHttpRequestOverride implements XMLHttpRequest {
    requestHeaders: Record<string, string> = {}
    responseHeaders: Record<string, string> = {}
    _events: any[] = []

    public readonly UNSENT = 0
    public readonly OPENED = 1
    public readonly HEADERS_RECEIVED = 2
    public readonly LOADING = 3
    public readonly DONE = 4

    /* Custom public properties */
    public method: string = 'GET'
    public url: string = ''

    /* XHR public properties */
    public withCredentials = false
    public status: number = 200
    public statusText: string = ''
    public user: string = ''
    public password: string = ''
    public data: string = ''
    public async: boolean = true
    public reponse: string = ''
    public responseText: string = ''
    public responseType: XMLHttpRequestResponseType = ''
    public responseXML: Document | null
    public responseURL: string = ''
    public response: string = ''
    public upload: XMLHttpRequestUpload = null as any
    public readyState: number = this.UNSENT
    public onreadystatechange: (
      this: XMLHttpRequest,
      ev: Event
    ) => any = null as any
    public timeout: number = 0

    /* Events */
    public onabort: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public onerror: (
      this: XMLHttpRequestEventTarget,
      event: Event
    ) => any = null as any
    public onload: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public onloadend: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public onloadstart: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public onprogress: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public ontimeout: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any

    constructor() {
      this.responseXML = null as any
    }

    trigger(event: string, options?: any) {
      if (this.onreadystatechange) {
        this.onreadystatechange.call(
          this,
          createEvent(options, this, 'readystatechange')
        )
      }

      const hasEvent = this._events.find((item) => item.type === 'loadend')
      if (this.readyState === this.DONE && (this.onloadend || hasEvent)) {
        let listener
        if (this.onloadend) {
          listener = this.onloadend
        } else if (typeof hasEvent !== 'undefined') {
          listener = hasEvent.listener
        }

        if (typeof listener !== 'undefined') {
          listener.call(this, createEvent(options, this, 'loadend'))
        }
      }

      if ((this as any)['on' + event]) {
        ;(this as any)['on' + event].call(
          this,
          createEvent(options, this, event)
        )
      }

      for (const event of this._events) {
        if (event.type === event) {
          event.listener.call(this, createEvent(options, this, event))
        }
      }

      return this
    }

    reset() {
      debug('reset')
      this.readyState = this.UNSENT
      this.status = 200
      this.statusText = ''
      this.requestHeaders = {}
      this.responseHeaders = {}
      this.data = ''
      this.response = null as any
      this.responseText = null as any
      this.responseXML = null as any
    }

    async open(
      method: string,
      url: string,
      async?: boolean,
      user?: string,
      password?: string
    ) {
      debug('open')

      this.reset()
      this.readyState = this.OPENED

      if (typeof url === 'undefined') {
        this.url = method
        this.method = 'GET'
      } else {
        this.url = url
        this.method = method
        this.async = !!async
        this.user = user || ''
        this.password = password || ''
      }
    }

    send(data?: string) {
      debug('send %s %s', this.method, this.url)

      this.readyState = this.LOADING
      this.data = data || ''

      const url = new URL(this.url)
      const req: InterceptedRequest = {
        url: this.url,
        method: this.method,
        query: url.searchParams,
        body: this.data,
        /**
         * @todo Parse headers to string[] values
         */
        headers: this.requestHeaders,
      }

      debug('awaiting mocked response...')
      Promise.resolve(middleware(req, this)).then((mockedResponse) => {
        // Return a mocked response, if provided in the middleware
        if (mockedResponse) {
          debug('recieved mocked response')
          this.status = mockedResponse.status || 200
          this.statusText = mockedResponse.statusText || ''
          this.responseHeaders = mockedResponse.headers
            ? flattenHeadersObject(mockedResponse.headers)
            : {}
          this.response = mockedResponse.body || ''

          this.trigger('loadstart')
          this.trigger('load')
        } else {
          debug('no mocked response, performing original request...')

          // Otherwise, perform an actual XHR
          const originalRequest = new XMLHttpRequestPristine()

          originalRequest.onload = () => {
            this.status = originalRequest.status
            this.statusText = originalRequest.statusText
            this.responseURL = originalRequest.responseURL
            this.responseType = originalRequest.responseType
            this.response = originalRequest.response
            this.responseText = originalRequest.responseText
            this.responseXML = originalRequest.responseXML

            this.trigger('loadstart')
            this.trigger('load')
          }

          // Map callbacks to the overridden instance's callbacks
          originalRequest.onerror = this.onerror
          originalRequest.ontimeout = this.ontimeout
          originalRequest.onreadystatechange = this.onreadystatechange

          // Dispatch the original request
          originalRequest.open(this.method, this.url)
          originalRequest.send(this.data)
        }
      })
    }

    abort() {
      debug('abort')

      if (this.readyState > this.UNSENT && this.readyState < this.DONE) {
        this.readyState = this.UNSENT
        this.trigger('abort')
      }
    }

    dispatchEvent() {
      return false
    }

    setRequestHeader(name: string, value: string) {
      this.requestHeaders[name] = value
    }

    getResponseHeader(name: string): string | null {
      if (this.readyState < this.HEADERS_RECEIVED) {
        return null
      }

      return this.responseHeaders[name.toLowerCase()] || null
    }

    getAllResponseHeaders(): string {
      if (this.readyState < this.HEADERS_RECEIVED) {
        return ''
      }

      return Object.entries(this.responseHeaders)
        .map(([name, value]) => `${name}: ${value} \r\n`)
        .join('')
    }

    overrideMimeType() {}

    addEventListener<K extends keyof XMLHttpRequestEventTargetEventMap>(
      event: K,
      listener: (event?: XMLHttpRequestEventTargetEventMap[K]) => any,
      useCapture?: boolean
    ) {
      this._events.push({
        event,
        listener,
      })
    }

    removeEventListener<K extends keyof XMLHttpRequestEventMap>(
      event: K,
      listener: (event?: XMLHttpRequestEventMap[K]) => any
    ): void {
      this._events = this._events.filter((storedEvent) => {
        return storedEvent.event !== event && storedEvent.listener !== listener
      })
    }
  }
}
