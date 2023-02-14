import { Response, Headers, Request } from '@remix-run/web-fetch'
import { headersToString } from 'headers-polyfill'
import { concatArrayBuffer } from './utils/concatArrayBuffer'
import { createEvent } from './utils/createEvent'
import { encodeBuffer } from '../../utils/bufferUtils'
import { createProxy } from '../../utils/createProxy'

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
            const [method, url] = args as [string, string]
            this.method = method
            this.url = new URL(url)
            this.reset()
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
            const onceRequestSettled =
              this.onRequest?.call(this, this.toFetchApiRequest()) ||
              Promise.resolve()

            onceRequestSettled.finally(() => {
              // If the consumer didn't handle the request
              // perform it as-is.
              if (this.request.readyState !== this.request.DONE) {
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

  public reset(): void {
    this.setReadyState(this.request.UNSENT)
    define(this.request, 'status', 0)
    define(this.request, 'statusText', '')

    this.requestHeaders = new Headers()
    this.responseBuffer = new Uint8Array()
  }

  /**
   * Responds to the current request with the given
   * Fetch API `Response` instance.
   */
  public respondWith(response: Response): void {
    define(this.request, 'status', response.status)
    define(this.request, 'statusText', response.statusText)
    define(this.request, 'responseURL', response.url)

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

    const totalResponseBodyLength = response.headers.has('Content-Length')
      ? Number(response.headers.get('Content-Length'))
      : undefined

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
    } else {
      finalizeResponse()
    }
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
    return new Request(this.url, {
      method: this.method,
      headers: this.requestHeaders,
      credentials: this.request.withCredentials ? 'include' : 'omit',
      body: this.requestBody as any,
    })
  }
}

function define(target: object, property: string, value: unknown): void {
  Reflect.defineProperty(target, property, {
    value,
  })
}
