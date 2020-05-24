/**
 * XMLHttpRequest override class.
 * Inspired by https://github.com/marvinhagemeister/xhr-mocklet.
 */
import { flattenHeadersObject } from 'headers-utils'
import { RequestMiddleware, InterceptedRequest } from '../../glossary'
import { createEvent } from './createEvent'

const debug = require('debug')('XHR')

export const createXMLHttpRequestOverride = (
  middleware: RequestMiddleware,
  XMLHttpRequestPristine: typeof window.XMLHttpRequest
) => {
  return class XMLHttpRequestOverride implements XMLHttpRequest {
    requestHeaders: Record<string, string> = {}
    responseHeaders: Record<string, string> = {}

    // Collection of events modified by `addEventListener`/`removeEventListener` calls.
    _events: any[] = []

    /* Request state */
    public readonly UNSENT = 0
    public readonly OPENED = 1
    public readonly HEADERS_RECEIVED = 2
    public readonly LOADING = 3
    public readonly DONE = 4

    /* Custom public properties */
    public method: string
    public url: string

    /* XHR public properties */
    public withCredentials: boolean
    public status: number
    public statusText: string
    public user: string
    public password: string
    public data: string
    public async: boolean
    public response: string
    public responseText: string
    public responseType: XMLHttpRequestResponseType
    public responseXML: Document | null
    public responseURL: string
    public upload: XMLHttpRequestUpload
    public readyState: number
    public onreadystatechange: (
      this: XMLHttpRequest,
      ev: Event
    ) => any = null as any
    public timeout: number

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
      this.url = ''
      this.method = 'GET'
      this.readyState = this.UNSENT
      this.withCredentials = false
      this.status = 200
      this.statusText = 'OK'
      this.user = ''
      this.password = ''
      this.data = ''
      this.async = true
      this.response = ''
      this.responseType = 'text'
      this.responseText = ''
      this.responseXML = null
      this.responseURL = ''
      this.upload = null as any
      this.timeout = 0
    }

    triggerReadyStateChange(options?: any) {
      if (this.onreadystatechange) {
        this.onreadystatechange.call(
          this,
          createEvent(options, this, 'readystatechange')
        )
      }
    }

    trigger<K extends keyof XMLHttpRequestEventTargetEventMap>(
      event: K,
      options?: any
    ) {
      debug('trigger', event)
      this.triggerReadyStateChange(options)

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

    public async open(
      method: string,
      url: string,
      async?: boolean,
      user?: string,
      password?: string
    ) {
      debug('open', { method, url, async, user, password })

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

    public send(data?: string) {
      debug('send %s %s', this.method, this.url)

      this.readyState = this.LOADING
      this.data = data || ''

      let url: URL

      try {
        url = new URL(this.url)
      } catch (error) {
        // Assume a relative URL, if construction of a new `URL` instance fails.
        // Since `XMLHttpRequest` always executed in a DOM-like environment,
        // resolve the relative request URL against the current window location.
        url = new URL(this.url, window.location.href)
      }

      // Create an intercepted request instance exposed to the request intercepting middleware.
      const req: InterceptedRequest = {
        url,
        method: this.method,
        body: this.data,
        headers: this.requestHeaders,
      }

      debug('awaiting mocked response...')

      Promise.resolve(middleware(req, this)).then((mockedResponse) => {
        // Return a mocked response, if provided in the middleware.
        if (mockedResponse) {
          debug('recieved mocked response', mockedResponse)

          this.status = mockedResponse.status || 200
          this.statusText = mockedResponse.statusText || 'OK'
          this.responseHeaders = mockedResponse.headers
            ? flattenHeadersObject(mockedResponse.headers)
            : {}

          // Mark that response headers has been received
          // and trigger a ready state event to reflect received headers
          // in a custom `onreadystatechange` callback.
          this.readyState = this.HEADERS_RECEIVED
          this.triggerReadyStateChange()

          this.response = mockedResponse.body || ''
          this.responseText = mockedResponse.body || ''

          // Trigger a progress event based on the mocked response body.
          this.trigger('progress', {
            loaded: this.response.length,
            total: this.response.length,
          })

          // Explicitly mark the request as done, so its response never hangs.
          // @see https://github.com/mswjs/node-request-interceptor/issues/13
          this.readyState = this.DONE

          this.trigger('loadstart')
          this.trigger('load')
          this.trigger('loadend')
        } else {
          debug('no mocked response')

          // Perform an original request, when the request middleware returned no mocked response.
          const originalRequest = new XMLHttpRequestPristine()

          debug('opening an original request %s %s', this.method, this.url)
          originalRequest.open(
            this.method,
            this.url,
            this.async,
            this.user,
            this.password
          )

          // Reflect a successful state of the original request
          // on the patched instance.
          originalRequest.onload = () => {
            debug('original onload')

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

          // Map callbacks given to the patched instance to the original request instance.
          originalRequest.onabort = this.abort
          originalRequest.onerror = this.onerror
          originalRequest.ontimeout = this.ontimeout
          originalRequest.onreadystatechange = this.onreadystatechange

          debug('send', this.data)
          originalRequest.send(this.data)
        }
      })
    }

    public abort() {
      debug('abort')

      if (this.readyState > this.UNSENT && this.readyState < this.DONE) {
        this.readyState = this.UNSENT
        this.trigger('abort')
      }
    }

    dispatchEvent() {
      return false
    }

    public setRequestHeader(name: string, value: string) {
      debug('set request header', name, value)
      this.requestHeaders[name] = value
    }

    public getResponseHeader(name: string): string | null {
      debug('get response header', name)

      if (this.readyState < this.HEADERS_RECEIVED) {
        debug(
          'cannot return a header: headers not received (state: %s)',
          this.readyState
        )
        return null
      }

      return this.responseHeaders[name.toLowerCase()] || null
    }

    public getAllResponseHeaders(): string {
      debug('get all response headers')

      if (this.readyState < this.HEADERS_RECEIVED) {
        debug(
          'cannot return headers: headers not received (state: %s)',
          this.readyState
        )
        return ''
      }

      return Object.entries(this.responseHeaders)
        .map(([name, value]) => `${name}: ${value} \r\n`)
        .join('')
    }

    public overrideMimeType() {}

    public addEventListener<K extends keyof XMLHttpRequestEventTargetEventMap>(
      event: K,
      listener: (event?: XMLHttpRequestEventTargetEventMap[K]) => any
    ) {
      this._events.push({
        event,
        listener,
      })
    }

    public removeEventListener<K extends keyof XMLHttpRequestEventMap>(
      event: K,
      listener: (event?: XMLHttpRequestEventMap[K]) => any
    ): void {
      this._events = this._events.filter((storedEvent) => {
        return storedEvent.event !== event && storedEvent.listener !== listener
      })
    }
  }
}
