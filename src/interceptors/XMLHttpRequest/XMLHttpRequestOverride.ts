/**
 * XMLHttpRequest override class.
 * Inspired by https://github.com/marvinhagemeister/xhr-mocklet.
 */
import { until } from '@open-draft/until'
import {
  flattenHeadersObject,
  reduceHeadersObject,
  HeadersObject,
  headersToObject,
  stringToHeaders,
  Headers,
} from 'headers-utils'
import { IsomoprhicRequest, Observer, Resolver } from '../../createInterceptor'
import { parseJson } from '../../utils/parseJson'
import { createEvent } from './helpers/createEvent'

const createDebug = require('debug')

type XMLHttpRequestEventHandler = (
  this: XMLHttpRequest,
  event: ProgressEvent<any>
) => void

interface XMLHttpRequestEvent<EventMap extends any> {
  name: keyof EventMap
  listener: XMLHttpRequestEventHandler
}

interface CreateXMLHttpRequestOverrideOptions {
  pureXMLHttpRequest: typeof window.XMLHttpRequest
  observer: Observer
  resolver: Resolver
}

export const createXMLHttpRequestOverride = (
  options: CreateXMLHttpRequestOverrideOptions
) => {
  const { pureXMLHttpRequest, observer, resolver } = options
  let debug = createDebug('XHR')

  return class XMLHttpRequestOverride implements XMLHttpRequest {
    requestHeaders: Record<string, string> = {}
    responseHeaders: Record<string, string> = {}

    // Collection of events modified by `addEventListener`/`removeEventListener` calls.
    _events: XMLHttpRequestEvent<XMLHttpRequestEventTargetEventMap>[] = []

    /* Request state */
    public static readonly UNSENT = 0
    public static readonly OPENED = 1
    public static readonly HEADERS_RECEIVED = 2
    public static readonly LOADING = 3
    public static readonly DONE = 4
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
    public user?: string
    public password?: string
    public data: string
    public async?: boolean
    public response: any
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
      this.data = ''
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
      eventName: K,
      options?: any
    ) {
      debug('trigger', eventName)
      this.triggerReadyStateChange(options)

      const loadendEvent = this._events.find(
        (event) => event.name === 'loadend'
      )

      if (this.readyState === this.DONE && (this.onloadend || loadendEvent)) {
        const listener = this.onloadend || loadendEvent?.listener
        listener?.call(this, createEvent(options, this, 'loadend'))
      }

      // Call the direct callback, if present.
      const directCallback = (this as any)[
        `on${eventName}`
      ] as XMLHttpRequestEventHandler
      directCallback?.call(this, createEvent(options, this, eventName))

      // Check in the list of events attached via `addEventListener`.
      for (const event of this._events) {
        if (event.name === eventName) {
          event.listener.call(this, createEvent(options, this, eventName))
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
      async: boolean = true,
      user?: string,
      password?: string
    ) {
      debug = createDebug(`XHR ${method} ${url}`)
      debug('open', { method, url, async, user, password })

      this.reset()
      this.readyState = this.OPENED

      if (typeof url === 'undefined') {
        this.url = method
        this.method = 'GET'
      } else {
        this.url = url
        this.method = method
        this.async = async
        this.user = user
        this.password = password
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

      const requestHeaders = reduceHeadersObject<HeadersObject>(
        this.requestHeaders,
        (headers, name, value) => {
          headers[name.toLowerCase()] = value
          return headers
        },
        {}
      )
      debug('request headers', requestHeaders)

      // Create an intercepted request instance exposed to the request intercepting middleware.
      const req: IsomoprhicRequest = {
        url,
        method: this.method,
        body: this.data,
        headers: requestHeaders,
      }

      debug('awaiting mocked response...')

      Promise.resolve(until(async () => resolver(req, this))).then(
        ([middlewareException, mockedResponse]) => {
          // When the request middleware throws an exception, error the request.
          // This cancels the request and is similar to a network error.
          if (middlewareException) {
            debug(
              'middleware function threw an exception!',
              middlewareException
            )

            // No way to propagate the actual error message.
            this.trigger('error')
            this.abort()

            return
          }

          // Return a mocked response, if provided in the middleware.
          if (mockedResponse) {
            debug('received mocked response', mockedResponse)

            this.status = mockedResponse.status || 200
            this.statusText = mockedResponse.statusText || 'OK'
            this.responseHeaders = mockedResponse.headers
              ? flattenHeadersObject(mockedResponse.headers)
              : {}

            debug('assigned response status', this.status, this.statusText)
            debug('assigned response headers', this.responseHeaders)

            // Mark that response headers has been received
            // and trigger a ready state event to reflect received headers
            // in a custom `onreadystatechange` callback.
            this.readyState = this.HEADERS_RECEIVED
            this.triggerReadyStateChange()

            debug('response type', this.responseType)
            this.response = this.getResponseBody(mockedResponse.body)
            this.responseText = mockedResponse.body || ''

            debug('assigned response body', this.response)

            if (mockedResponse.body && this.response) {
              // Presense of the mocked response implies a response body (not null).
              // Presece of the coerced `this.response` implies the mocked body is valid.
              const bodyBuffer = Buffer.from(mockedResponse.body)

              // Trigger a progress event based on the mocked response body.
              this.trigger('progress', {
                loaded: bodyBuffer.length,
                total: bodyBuffer.length,
              })
            }

            // Explicitly mark the request as done, so its response never hangs.
            // @see https://github.com/mswjs/node-request-interceptor/issues/13
            this.readyState = this.DONE

            this.trigger('loadstart')
            this.trigger('load')
            this.trigger('loadend')

            observer.emit('response', req, {
              status: this.status,
              statusText: this.statusText,
              headers: new Headers(mockedResponse.headers || {}),
              body: mockedResponse.body,
            })
          } else {
            debug('no mocked response received')

            // Perform an original request, when the request middleware returned no mocked response.
            const originalRequest = new pureXMLHttpRequest()

            debug('opening an original request %s %s', this.method, this.url)
            originalRequest.open(
              this.method,
              this.url,
              this.async ?? true,
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

              debug(
                'received original response status:',
                this.status,
                this.statusText
              )
              debug('received original response body:', this.response)

              this.trigger('loadstart')
              this.trigger('load')

              const responseHeaders = originalRequest.getAllResponseHeaders()
              this.responseHeaders = flattenHeadersObject(
                headersToObject(stringToHeaders(responseHeaders))
              )
              debug('original response headers', responseHeaders)

              const normalizedResponseHeaders = stringToHeaders(responseHeaders)
              debug(
                'original response headers (normalized)',
                normalizedResponseHeaders
              )

              observer.emit('response', req, {
                status: originalRequest.status,
                statusText: originalRequest.statusText,
                headers: normalizedResponseHeaders,
                body: originalRequest.response,
              })
            }

            // Assign callbacks and event listeners from the intercepted XHR instance
            // to the original XHR instance.
            this.propagateCallbacks(originalRequest)
            this.propagateListeners(originalRequest)
            this.propagateHeaders(originalRequest, requestHeaders)

            if (this.async) {
              originalRequest.timeout = this.timeout
            }

            debug('send', this.data)
            originalRequest.send(this.data)
          }
        }
      )
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

      const headerValue = Object.entries(this.responseHeaders).reduce<
        string | null
      >((_, [headerName, headerValue]) => {
        return headerName.toLowerCase() === name.toLowerCase()
          ? headerValue
          : null
      }, null)

      debug('resolved response header', name, headerValue, this.responseHeaders)

      return headerValue
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

    public addEventListener<K extends keyof XMLHttpRequestEventTargetEventMap>(
      name: K,
      listener: (event?: XMLHttpRequestEventTargetEventMap[K]) => void
    ) {
      debug('addEventListener', name, listener)
      this._events.push({
        name,
        listener,
      })
    }

    public removeEventListener<K extends keyof XMLHttpRequestEventMap>(
      name: K,
      listener: (event?: XMLHttpRequestEventMap[K]) => void
    ): void {
      debug('removeEventListener', name, listener)
      this._events = this._events.filter((storedEvent) => {
        return storedEvent.name !== name && storedEvent.listener !== listener
      })
    }

    public overrideMimeType() {}

    /**
     * Sets a proper `response` property based on the `responseType` value.
     */
    getResponseBody(body: string | undefined) {
      // Handle an improperly set "null" value of the mocked response body.
      const textBody = body ?? ''
      debug('coerced response body to', textBody)

      switch (this.responseType) {
        case 'json': {
          debug('resolving response body as JSON')
          return parseJson(textBody)
        }

        case 'blob': {
          const blobType =
            this.getResponseHeader('content-type') || 'text/plain'
          debug('resolving response body as Blob', { type: blobType })

          return new Blob([textBody], {
            type: blobType,
          })
        }

        case 'arraybuffer': {
          debug('resolving response body as ArrayBuffer')
          const buffer = Buffer.from(textBody)
          const arrayBuffer = new Uint8Array(buffer)
          return arrayBuffer
        }

        default:
          return textBody
      }
    }

    /**
     * Propagates captured XHR instance callbacks to the given XHR instance.
     * @note that `onload` listener is explicitly omitted.
     */
    propagateCallbacks(req: XMLHttpRequest) {
      req.onabort = this.abort
      req.onerror = this.onerror
      req.ontimeout = this.ontimeout
      req.onloadstart = this.onloadstart
      req.onloadend = this.onloadend
      req.onprogress = this.onprogress
      req.onreadystatechange = this.onreadystatechange
    }

    propagateListeners(req: XMLHttpRequest) {
      this._events.forEach(({ name, listener }) => {
        req.addEventListener(name, listener)
      })
    }

    propagateHeaders(
      req: XMLHttpRequest,
      headers: Record<string, string | string[]>
    ) {
      const flatHeaders = flattenHeadersObject(headers)
      Object.entries(flatHeaders).forEach(([key, value]) => {
        req.setRequestHeader(key, value)
      })
    }
  }
}
