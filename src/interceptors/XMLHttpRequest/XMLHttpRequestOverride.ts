/**
 * XMLHttpRequest override class.
 * Inspired by https://github.com/marvinhagemeister/xhr-mocklet.
 */
import type { Debugger } from 'debug'
import { until } from '@open-draft/until'
import { Request } from '@remix-run/web-fetch'
import { Headers, stringToHeaders, headersToString } from 'headers-polyfill'
import { parseJson } from '../../utils/parseJson'
import { createEvent } from './utils/createEvent'
import type { XMLHttpRequestEmitter } from '.'
import {
  encodeBuffer,
  decodeBuffer,
  toArrayBuffer,
} from '../../utils/bufferUtils'
import { createResponse } from './utils/createResponse'
import { concatArrayBuffer } from './utils/concatArrayBuffer'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { uuidv4 } from '../../utils/uuid'
import { isDomParserSupportedType } from './utils/isDomParserSupportedType'

type XMLHttpRequestEventHandler = (
  this: XMLHttpRequest,
  event: Event | ProgressEvent<any>
) => void

interface XMLHttpRequestEvent<EventMap extends any> {
  name: keyof EventMap
  listener: XMLHttpRequestEventHandler
}

interface CreateXMLHttpRequestOverrideOptions {
  XMLHttpRequest: typeof window.XMLHttpRequest
  emitter: XMLHttpRequestEmitter
  log: Debugger
}

interface InternalXMLHttpRequestEventTargetEventMap
  extends XMLHttpRequestEventTargetEventMap {
  readystatechange: Event
}

export type ExtractCallbacks<Key extends string> = Key extends
  | 'abort'
  | `on${infer _CallbackName}`
  ? Key
  : never

export const createXMLHttpRequestOverride = (
  options: CreateXMLHttpRequestOverrideOptions
) => {
  const { XMLHttpRequest, emitter, log } = options

  return class XMLHttpRequestOverride implements XMLHttpRequest {
    _requestHeaders: Headers
    _responseHeaders: Headers
    _responseBuffer: Uint8Array

    // Collection of events modified by `addEventListener`/`removeEventListener` calls.
    _events: XMLHttpRequestEvent<InternalXMLHttpRequestEventTargetEventMap>[] =
      []

    log: Debugger = log

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
    public async?: boolean
    public responseType: XMLHttpRequestResponseType
    public responseURL: string
    public upload: XMLHttpRequestUpload
    public readyState: number
    public onreadystatechange: (this: XMLHttpRequest, ev: Event) => any =
      null as any
    public timeout: number

    /* Events */
    public onabort: (
      this: XMLHttpRequestEventTarget,
      event: ProgressEvent
    ) => any = null as any
    public onerror: (this: XMLHttpRequestEventTarget, event: Event) => any =
      null as any
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
      this.status = 0
      this.statusText = ''
      this.responseType = 'text'
      this.responseURL = ''
      this.upload = {} as any
      this.timeout = 0

      this._requestHeaders = new Headers()
      this._responseBuffer = new Uint8Array()
      this._responseHeaders = new Headers()
    }

    setReadyState(nextState: number): void {
      if (nextState === this.readyState) {
        return
      }

      this.log('readyState change %d -> %d', this.readyState, nextState)
      this.readyState = nextState

      if (nextState !== this.UNSENT) {
        this.log('triggering readystate change...')
        this.trigger('readystatechange')
      }
    }

    /**
     * Triggers both direct callback and attached event listeners
     * for the given event.
     */
    trigger<
      K extends keyof (XMLHttpRequestEventTargetEventMap & {
        readystatechange: ProgressEvent<XMLHttpRequestEventTarget>
      })
    >(eventName: K, options?: ProgressEventInit) {
      this.log('trigger "%s" (%d)', eventName, this.readyState)
      this.log('resolve listener for event "%s"', eventName)

      const callback = this[`on${eventName}`] as XMLHttpRequestEventHandler
      callback?.call(this, createEvent(this, eventName, options))

      for (const event of this._events) {
        if (event.name === eventName) {
          log(
            'calling mock event listener "%s" (%d)',
            eventName,
            this.readyState
          )
          event.listener.call(this, createEvent(this, eventName, options))
        }
      }

      return this
    }

    reset() {
      this.log('reset')

      this.setReadyState(this.UNSENT)
      this.status = 0
      this.statusText = ''

      this._responseBuffer = new Uint8Array()
      this._requestHeaders = new Headers()
      this._responseHeaders = new Headers()
    }

    public async open(
      method: string,
      url: string,
      async: boolean = true,
      user?: string,
      password?: string
    ) {
      this.log = this.log.extend(`request ${method} ${url}`)
      this.log('open', { method, url, async, user, password })

      this.reset()
      this.setReadyState(this.OPENED)

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

    public send(data?: string | ArrayBuffer) {
      this.log('send %s %s', this.method, this.url)

      const requestBuffer: ArrayBuffer | undefined =
        typeof data === 'string' ? encodeBuffer(data) : data

      let url: URL

      try {
        url = new URL(this.url)
      } catch (error) {
        // Assume a relative URL, if construction of a new `URL` instance fails.
        // Since `XMLHttpRequest` always executed in a DOM-like environment,
        // resolve the relative request URL against the current window location.
        url = new URL(this.url, window.location.href)
      }

      this.log('request headers', this._requestHeaders)

      // Create an intercepted request instance exposed to the request intercepting middleware.
      const requestId = uuidv4()
      const capturedRequest = new Request(url, {
        method: this.method,
        headers: this._requestHeaders,
        credentials: this.withCredentials ? 'include' : 'omit',
        body: requestBuffer,
      })

      const interactiveRequest = toInteractiveRequest(capturedRequest)

      this.log(
        'emitting the "request" event for %d listener(s)...',
        emitter.listenerCount('request')
      )
      emitter.emit('request', interactiveRequest, requestId)

      this.log('awaiting mocked response...')

      Promise.resolve(
        until(async () => {
          await emitter.untilIdle(
            'request',
            ({ args: [, pendingRequestId] }) => {
              return pendingRequestId === requestId
            }
          )
          this.log('all request listeners have been resolved!')

          const [mockedResponse] =
            await interactiveRequest.respondWith.invoked()
          this.log('event.respondWith called with:', mockedResponse)

          return mockedResponse
        })
      ).then(([middlewareException, mockedResponse]) => {
        // When the request middleware throws an exception, error the request.
        // This cancels the request and is similar to a network error.
        if (middlewareException) {
          this.log(
            'middleware function threw an exception!',
            middlewareException
          )

          // Mark the request as complete.
          this.setReadyState(this.DONE)

          // No way to propagate the actual error message.
          this.trigger('error')

          // Emit the "loadend" event to notify that the request has settled.
          // In this case, there's been an error with the request so
          // we must not emit the "load" event.
          this.trigger('loadend')

          // Abort must not be called when request fails!
          // this.abort()

          return
        }

        // Forward request headers modified in the "request" listener.
        this._requestHeaders = new Headers(capturedRequest.headers)

        // Return a mocked response, if provided in the middleware.
        if (mockedResponse) {
          const responseClone = mockedResponse.clone()
          this.log('received mocked response', mockedResponse)

          this.status = mockedResponse.status ?? 200
          this.statusText = mockedResponse.statusText || 'OK'
          this.log('set response status', this.status, this.statusText)

          this._responseHeaders = new Headers(mockedResponse.headers || {})
          this.log('set response headers', this._responseHeaders)

          this.log('response type', this.responseType)
          this.responseURL = this.url

          const totalLength = this._responseHeaders.has('Content-Length')
            ? Number(this._responseHeaders.get('Content-Length'))
            : undefined

          // Trigger a loadstart event to indicate the initialization of the fetch.
          this.trigger('loadstart', { loaded: 0, total: totalLength })

          // Mark that response headers has been received
          // and trigger a ready state event to reflect received headers
          // in a custom "onreadystatechange" callback.
          this.setReadyState(this.HEADERS_RECEIVED)

          this.setReadyState(this.LOADING)

          const closeResponseStream = () => {
            /**
             * Explicitly mark the request as done so its response never hangs.
             * @see https://github.com/mswjs/interceptors/issues/13
             */
            this.setReadyState(this.DONE)

            // Always trigger the "load" event because at this point
            // the request has been performed successfully.
            this.trigger('load', {
              loaded: this._responseBuffer.byteLength,
              total: totalLength,
            })

            // Trigger a loadend event to indicate the fetch has completed.
            this.trigger('loadend', {
              loaded: this._responseBuffer.byteLength,
              total: totalLength,
            })

            emitter.emit('response', responseClone, capturedRequest, requestId)
          }

          if (mockedResponse.body) {
            const reader = mockedResponse.body.getReader()

            const readNextChunk = async (): Promise<void> => {
              const { value, done } = await reader.read()

              if (done) {
                closeResponseStream()
                return
              }

              if (value) {
                this._responseBuffer = concatArrayBuffer(
                  this._responseBuffer,
                  value
                )

                this.trigger('progress', {
                  loaded: this._responseBuffer.byteLength,
                  total: totalLength,
                })
              }

              readNextChunk()
            }

            readNextChunk()
          } else {
            closeResponseStream()
          }
        } else {
          this.log('no mocked response received!')

          // Perform an original request, when the request middleware returned no mocked response.
          const originalRequest = new XMLHttpRequest()

          this.log('opening an original request %s %s', this.method, this.url)
          originalRequest.open(
            this.method,
            this.url,
            this.async ?? true,
            this.user,
            this.password
          )

          originalRequest.addEventListener('readystatechange', () => {
            // Forward the original response headers to the patched instance
            // immediately as they are received.
            if (
              originalRequest.readyState === XMLHttpRequest.HEADERS_RECEIVED
            ) {
              const responseHeaders = originalRequest.getAllResponseHeaders()
              this.log('original response headers:\n', responseHeaders)

              this._responseHeaders = stringToHeaders(responseHeaders)
              this.log(
                'original response headers (normalized)',
                this._responseHeaders
              )
            }
          })

          originalRequest.addEventListener('loadstart', () => {
            // Forward the response type to the patched instance immediately.
            // Response type affects how response reading properties are resolved.
            this.responseType = originalRequest.responseType
          })

          originalRequest.addEventListener('progress', () => {
            this._responseBuffer = concatArrayBuffer(
              this._responseBuffer,
              encodeBuffer(originalRequest.responseText)
            )
          })

          originalRequest.addEventListener('load', () => {
            this.status = originalRequest.status
            this.statusText = originalRequest.statusText
            this.responseURL = originalRequest.responseURL
            this.log('received original response', this.status, this.statusText)

            // Explicitly mark the mocked request instance as done
            // so the response never hangs.
            this.setReadyState(this.DONE)
            this.log('set mock request readyState to DONE')

            this.log('original response body:', this.response)
            this.log('original response finished!')
          });

          // Update the patched instance on the "loadend" event
          // because it fires when the request settles (succeeds/errors).
          originalRequest.addEventListener('loadend', () => {
            this.log('original "loadend"')

            emitter.emit(
              'response',
              createResponse(originalRequest, this._responseBuffer),
              capturedRequest,
              requestId
            )
          })

          this.propagateHeaders(originalRequest, this._requestHeaders)

          // Assign callbacks and event listeners from the intercepted XHR instance
          // to the original XHR instance.
          this.propagateCallbacks(originalRequest)
          this.propagateListeners(originalRequest)

          if (this.async) {
            originalRequest.timeout = this.timeout
          }

          /**
           * @note Set the intercepted request ID on the original request
           * so that if it triggers any other interceptors, they don't attempt
           * to process it once again. This happens when bypassing XMLHttpRequest
           * because it's polyfilled with "http.ClientRequest" in JSDOM.
           */
          originalRequest.setRequestHeader('X-Request-Id', requestId)

          this.log('send', data)
          originalRequest.send(data)
        }
      })
    }

    public get responseText(): string {
      this.log('responseText()')

      return decodeBuffer(this._responseBuffer)
    }

    public get response(): unknown {
      switch (this.responseType) {
        case 'json': {
          this.log('resolving response body as JSON')
          return parseJson(this.responseText)
        }

        case 'arraybuffer': {
          this.log('resolving response body as ArrayBuffer')
          return toArrayBuffer(this._responseBuffer)
        }

        case 'blob': {
          const mimeType =
            this.getResponseHeader('content-type') || 'text/plain'
          this.log('resolving response body as blog (%s)', mimeType)
          return new Blob([this.responseText], { type: mimeType })
        }

        case 'document': {
          this.log('resolving response body as XML')
          return this.responseXML
        }

        default: {
          return this.responseText
        }
      }
    }

    public get responseXML(): Document | null {
      const contentType = this.getResponseHeader('content-type') || ''
      this.log('responseXML() %s', contentType)

      if (typeof DOMParser === 'undefined') {
        console.warn(
          'Cannot retrieve XMLHttpRequest response body as XML: DOMParser is not defined. You are likely using an environment that is not browser or does not polyfill browser globals correctly.'
        )
        return null
      }

      if (isDomParserSupportedType(contentType)) {
        this.log('response content-type is XML, parsing...')
        return new DOMParser().parseFromString(this.responseText, contentType)
      }

      this.log('response content type is not XML, returning null...')
      return null
    }

    public abort() {
      this.log('abort()')

      if (this.readyState > this.UNSENT && this.readyState < this.DONE) {
        this.reset()
        this.trigger('abort')
      }
    }

    public dispatchEvent() {
      return false
    }

    public setRequestHeader(name: string, value: string) {
      this.log('setRequestHeader() "%s" to "%s"', name, value)
      this._requestHeaders.append(name, value)
    }

    public getResponseHeader(name: string): string | null {
      this.log('getResponseHeader() "%s"', name)

      if (this.readyState < this.HEADERS_RECEIVED) {
        this.log(
          'cannot return a header: headers not received (state: %s)',
          this.readyState
        )
        return null
      }

      const headerValue = this._responseHeaders.get(name)

      this.log(
        'resolved response header "%s" to "%s"',
        name,
        headerValue,
        this._responseHeaders
      )

      return headerValue
    }

    public getAllResponseHeaders(): string {
      this.log('getAllResponseHeaders()')

      if (this.readyState < this.HEADERS_RECEIVED) {
        this.log(
          'cannot return headers: headers not received (state: %s)',
          this.readyState
        )
        return ''
      }

      return headersToString(this._responseHeaders)
    }

    public addEventListener<
      Event extends keyof InternalXMLHttpRequestEventTargetEventMap
    >(event: Event, listener: XMLHttpRequestEventHandler) {
      this.log('addEventListener', event, listener)
      this._events.push({
        name: event,
        listener,
      })
    }

    public removeEventListener<Event extends keyof XMLHttpRequestEventMap>(
      event: Event,
      listener: (event?: XMLHttpRequestEventMap[Event]) => void
    ): void {
      this.log('removeEventListener', name, listener)
      this._events = this._events.filter((storedEvent) => {
        return storedEvent.name !== event && storedEvent.listener !== listener
      })
    }

    public overrideMimeType() {}

    /**
     * Propagates mock XMLHttpRequest instance callbacks
     * to the given XMLHttpRequest instance.
     */
    propagateCallbacks(request: XMLHttpRequest) {
      this.log('propagating request callbacks to the original request')
      const callbackNames: Array<ExtractCallbacks<keyof XMLHttpRequest>> = [
        'abort',
        'onerror',
        'ontimeout',
        'onload',
        'onloadstart',
        'onloadend',
        'onprogress',
        'onreadystatechange',
      ]

      for (const callbackName of callbackNames) {
        const callback = this[callbackName]

        if (callback) {
          request[callbackName] = this[callbackName] as any

          this.log('propagated the "%s" callback', callbackName, callback)
        }
      }

      request.onabort = this.abort
      request.onerror = this.onerror
      request.ontimeout = this.ontimeout
      request.onload = this.onload
      request.onloadstart = this.onloadstart
      request.onloadend = this.onloadend
      request.onprogress = this.onprogress
      request.onreadystatechange = this.onreadystatechange
    }

    /**
     * Propagates the mock XMLHttpRequest instance listeners
     * to the given XMLHttpRequest instance.
     */
    propagateListeners(request: XMLHttpRequest) {
      this.log(
        'propagating request listeners (%d) to the original request',
        this._events.length,
        this._events
      )

      this._events.forEach(({ name, listener }) => {
        request.addEventListener(name, listener)
      })
    }

    propagateHeaders(request: XMLHttpRequest, headers: Headers) {
      this.log('propagating request headers to the original request', headers)

      for (const [headerName, headerValue] of headers) {
        this.log(
          'setting "%s" (%s) header on the original request',
          headerName,
          headerValue
        )
        request.setRequestHeader(headerName, headerValue)
      }
    }
  }
}
