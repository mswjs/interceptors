import { Headers, Request } from '@remix-run/web-fetch'
import { headersToString } from 'headers-polyfill'
import { concatArrayBuffer } from './utils/concatArrayBuffer'
import { createEvent } from './utils/createEvent'
import {
  decodeBuffer,
  encodeBuffer,
  toArrayBuffer,
} from '../../utils/bufferUtils'
import { createProxy } from '../../utils/createProxy'
import { isDomParserSupportedType } from './utils/isDomParserSupportedType'
import { parseJson } from '../../utils/parseJson'
import { nextTick } from '../../utils/nextTick'

export class XMLHttpRequestController {
  public request: XMLHttpRequest
  public onRequest?: (request: Request) => Promise<void>

  private method: string = 'GET'
  private url: URL = null as any
  private requestHeaders: Headers
  private requestBody?: XMLHttpRequestBodyInit | Document | null
  private responseBuffer: Uint8Array
  private events: Map<keyof XMLHttpRequestEventTargetEventMap, Array<Function>>

  constructor(readonly initialRequest: XMLHttpRequest) {
    this.events = new Map()
    this.requestHeaders = new Headers()
    this.responseBuffer = new Uint8Array()

    this.request = createProxy(initialRequest, {
      methodCall: ([methodName, args], invoke) => {
        switch (methodName) {
          case 'open': {
            const [method, url] = args as [string, string | undefined]

            if (typeof url === 'undefined') {
              this.method = 'GET'
              this.url = toAbsoluteUrl(method)
            } else {
              this.method = method
              this.url = toAbsoluteUrl(url)
            }

            return invoke()
          }

          case 'addEventListener': {
            const [eventName, listener] = args as [
              keyof XMLHttpRequestEventTargetEventMap,
              Function
            ]
            this.registerEvent(eventName, listener)
            return invoke()
          }

          case 'setRequestHeader': {
            const [name, value] = args as [string, string]
            this.requestHeaders.set(name, value)
            return invoke()
          }

          case 'send': {
            const [body] = args as [
              body?: XMLHttpRequestBodyInit | Document | null
            ]

            if (body != null) {
              this.requestBody =
                typeof body === 'string' ? encodeBuffer(body) : body
            }

            // Delegate request handling to the consumer.
            const fetchRequest = this.toFetchApiRequest()
            const onceRequestSettled =
              this.onRequest?.call(this, fetchRequest) || Promise.resolve()

            onceRequestSettled.finally(() => {
              // If the consumer didn't handle the request perform it as-is.
              // Note that the request may not yet be DONE and may, in fact,
              // be LOADING while the "respondWith" method does its magic.
              if (this.request.readyState < this.request.LOADING) {
                return invoke()
              }
            })

            break
          }

          case 'onabort':
          case 'onerror':
          case 'onload':
          case 'onloadend':
          case 'onloadstart':
          case 'onprogress':
          case 'ontimeout':
          case 'onreadystatechange': {
            const [listener] = args as [Function]
            this.registerEvent(
              methodName as keyof XMLHttpRequestEventTargetEventMap,
              listener
            )
            return invoke()
          }

          default: {
            return invoke()
          }
        }
      },
    })
  }

  private registerEvent(
    eventName: keyof XMLHttpRequestEventTargetEventMap,
    listener: Function
  ): void {
    const prevEvents = this.events.get(eventName) || []
    const nextEvents = prevEvents.concat(listener)
    this.events.set(eventName, nextEvents)
  }

  /**
   * Responds to the current request with the given
   * Fetch API `Response` instance.
   */
  public respondWith(response: Response): void {
    define(this.request, 'status', response.status)
    define(this.request, 'statusText', response.statusText)
    define(this.request, 'responseURL', this.url.href)

    this.request.getResponseHeader = new Proxy(this.request.getResponseHeader, {
      apply: (_, __, args: [name: string]) => {
        if (this.request.readyState < this.request.HEADERS_RECEIVED) {
          // Headers not received yet, nothing to return.
          return null
        }

        return response.headers.get(args[0])
      },
    })

    this.request.getAllResponseHeaders = new Proxy(
      this.request.getAllResponseHeaders,
      {
        apply: () => {
          if (this.request.readyState < this.request.HEADERS_RECEIVED) {
            // Headers not received yet, nothing to return.
            return ''
          }

          return headersToString(response.headers)
        },
      }
    )

    // Update the response getters to resolve against the mocked response.
    Object.defineProperties(this.request, {
      response: { enumerable: true, get: this.getResponse.bind(this) },
      responseText: { enumerable: true, get: this.getResponseText.bind(this) },
      responseXML: { enumerable: true, get: this.getResponseXML.bind(this) },
    })

    const totalResponseBodyLength = response.headers.has('Content-Length')
      ? Number(response.headers.get('Content-Length'))
      : /**
         * @todo Infer the response body length from the response body.
         */
        undefined

    this.trigger('loadstart', {
      loaded: 0,
      total: totalResponseBodyLength,
    })

    this.setReadyState(this.request.HEADERS_RECEIVED)
    this.setReadyState(this.request.LOADING)

    const finalizeResponse = () => {
      this.setReadyState(this.request.DONE)

      this.trigger('load', {
        loaded: this.responseBuffer.byteLength,
        total: totalResponseBodyLength,
      })

      this.trigger('loadend', {
        loaded: this.responseBuffer.byteLength,
        total: totalResponseBodyLength,
      })
    }

    if (response.body) {
      const reader = response.body.getReader()

      const readNextResponseBodyChunk = async () => {
        const { value, done } = await reader.read()

        if (done) {
          finalizeResponse()
          return
        }

        if (value) {
          this.responseBuffer = concatArrayBuffer(this.responseBuffer, value)

          this.trigger('progress', {
            loaded: this.responseBuffer.byteLength,
            total: totalResponseBodyLength,
          })
        }

        readNextResponseBodyChunk()
      }

      readNextResponseBodyChunk()
    } else {
      finalizeResponse()
    }
  }

  private getResponse(): unknown {
    switch (this.request.responseType) {
      case 'json': {
        return parseJson(this.getResponseText())
      }

      case 'arraybuffer': {
        return toArrayBuffer(this.responseBuffer)
      }

      case 'blob': {
        const mimeType =
          this.request.getResponseHeader('Content-Type') || 'text/plain'
        return new Blob([this.getResponseText()], { type: mimeType })
      }

      default: {
        return this.getResponseText()
      }
    }
  }

  private getResponseText(): string {
    return decodeBuffer(this.responseBuffer)
  }

  private getResponseXML(): Document | null {
    const contentType = this.request.getResponseHeader('Content-Type') || ''

    if (typeof DOMParser === 'undefined') {
      console.warn(
        'Cannot retrieve XMLHttpRequest response body as XML: DOMParser is not defined. You are likely using an environment that is not browser or does not polyfill browser globals correctly.'
      )
      return null
    }

    if (isDomParserSupportedType(contentType)) {
      return new DOMParser().parseFromString(
        this.getResponseText(),
        contentType
      )
    }

    return null
  }

  public errorWith(error: Error): void {
    this.setReadyState(this.request.DONE)
    this.trigger('error')
    this.trigger('loadend')
  }

  /**
   * Transitions this request's `readyState` to the given one.
   */
  private setReadyState(nextReadyState: number): void {
    if (this.request.readyState === nextReadyState) {
      return
    }

    define(this.request, 'readyState', nextReadyState)

    if (nextReadyState !== this.request.UNSENT) {
      this.trigger('readystatechange')
    }
  }

  /**
   * Triggers given event on the `XMLHttpRequest` instance.
   */
  private trigger<
    EventName extends keyof (XMLHttpRequestEventTargetEventMap & {
      readystatechange: ProgressEvent<XMLHttpRequestEventTarget>
    })
  >(eventName: EventName, options?: ProgressEventInit): void {
    const callback = this.request[`on${eventName}`]
    const event = createEvent(this.request, eventName, options)

    // Invoke direct callbacks.
    if (typeof callback === 'function') {
      callback.call(this.request, event)
    }

    // Invoke event listeners.
    for (const [registeredEventName, listeners] of this.events) {
      if (registeredEventName === eventName) {
        listeners.forEach((listener) => listener.call(this.request, event))
      }
    }
  }

  /**
   * Converts this `XMLHttpRequest` instance into a Fetch API `Request` instance.
   */
  public toFetchApiRequest(): Request {
    const fetchRequest = new Request(this.url, {
      method: this.method,
      headers: this.requestHeaders,
      /**
       * @see https://xhr.spec.whatwg.org/#cross-origin-credentials
       */
      credentials: this.request.withCredentials ? 'include' : 'same-origin',
      body: this.requestBody as any,
    })

    const proxyHeaders = createProxy(fetchRequest.headers, {
      methodCall: ([methodName, args], invoke) => {
        // Forward the latest state of the internal request headers
        // because the interceptor might have modified them
        // without responding to the request.
        switch (methodName) {
          case 'append':
          case 'set': {
            // @ts-ignore
            this.request.setRequestHeader(args[0], args[1])
            break
          }

          case 'delete': {
            const [headerName] = args as [string]
            console.warn(
              `XMLHttpRequest: Cannot remove a "${headerName}" header from the Fetch API representation of the "${fetchRequest.method} ${fetchRequest.url}" request. XMLHttpRequest headers cannot be removed.`
            )
            break
          }
        }

        return invoke()
      },
    })
    define(fetchRequest, 'headers', proxyHeaders)

    return fetchRequest
  }
}

function toAbsoluteUrl(url: string | URL): URL {
  return new URL(url.toString(), location.href)
}

function define(target: object, property: string, value: unknown): void {
  Reflect.defineProperty(target, property, {
    // Ensure writable properties to allow redefining readonly properties.
    writable: true,
    enumerable: true,
    value,
  })
}
