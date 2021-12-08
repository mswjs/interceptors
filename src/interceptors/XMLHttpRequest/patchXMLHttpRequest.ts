import { until } from '@open-draft/until'
import { DOMParser } from '@xmldom/xmldom'
import { Headers, headersToString, stringToHeaders } from 'headers-utils'
import { StrictEventEmitter } from 'strict-event-emitter'
import {
  IsomorphicRequest,
  IsomorphicResponse,
  MockedResponse,
  Observer,
  Resolver,
} from '../../createInterceptor'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { uuidv4 } from '../../utils/uuid'
import { bufferFrom } from './utils/bufferFrom'
import { createEvent } from './utils/createEvent'

interface XMLHttpRequestPatchOptions {
  resolver: Resolver
  observer: Observer
}

export type XMLHttpRequestBodyType =
  | Document
  | BodyInit
  | string
  | null
  | undefined

export interface NodeXMLHttpRequest extends XMLHttpRequest {
  url: string
  method: string
  events: StrictEventEmitter<{
    [event: string]: (
      this: NodeXMLHttpRequest,
      event: ProgressEvent<XMLHttpRequestEventTarget>
    ) => void
  }>
  responseSource: 'mocked' | 'bypass'
  requestHeaders: Headers
  responseHeaders: Headers
  responseContentType: string
}

declare global {
  interface XMLHttpRequest {
    trigger<Event extends keyof XMLHttpRequestEventMap>(
      this: NodeXMLHttpRequest,
      event: Event,
      options?: ProgressEventInit,
      customTarget?: NodeXMLHttpRequest | XMLHttpRequestUpload
    ): void
    setReadyState(this: NodeXMLHttpRequest, nextState: number): void
    respondWith(this: NodeXMLHttpRequest, response: MockedResponse): void
  }

  interface XMLHttpRequestUpload {
    events: StrictEventEmitter<any>
  }
}

export function patchXMLHttpRequest(options: XMLHttpRequestPatchOptions): void {
  const { resolver, observer } = options

  // Original methods must be destructed because referencing the prototype
  // already references its patched version, creating an infinite loop.
  const {
    open,
    send,
    addEventListener,
    removeEventListener,
    setRequestHeader,
    getResponseHeader,
    getAllResponseHeaders,
  } = XMLHttpRequest.prototype

  window.XMLHttpRequest.prototype.open = function (
    this: NodeXMLHttpRequest,
    method,
    url,
    async?: boolean | null,
    username?: string,
    password?: string
  ) {
    this.url = url
    this.method = method

    return open(method, url, !!async, username, password)
  }

  window.XMLHttpRequest.prototype.send = function (
    this: NodeXMLHttpRequest,
    body?: any
  ) {
    const isomorphicRequest = toIsomorphicRequest.call(this, body)
    until(async () => resolver(isomorphicRequest, this)).then(
      ([resolverError, mockedResponse]) => {
        if (resolverError) {
          this.trigger('error')
          this.abort()
          return
        }

        if (mockedResponse) {
          this.respondWith(mockedResponse)
          observer.emit(
            'response',
            isomorphicRequest,
            toIsoResponse(mockedResponse)
          )
          return
        }

        this.responseSource = 'bypass'
        this.addEventListener('loadend', () => {
          if (this.readyState !== this.DONE) {
            return
          }

          const rawResponseHeaders = this.getAllResponseHeaders()
          if (rawResponseHeaders) {
            this.responseHeaders = stringToHeaders(rawResponseHeaders)
          }

          const isomorphicResponse: IsomorphicResponse = {
            status: this.status,
            statusText: this.statusText,
            headers: this.responseHeaders,
            body: this.response,
          }

          observer.emit('response', isomorphicRequest, isomorphicResponse)
        })

        return send.call(this, body)
      }
    )
  }

  window.XMLHttpRequest.prototype.addEventListener = function <
    Event extends keyof XMLHttpRequestEventTargetEventMap
  >(
    this: NodeXMLHttpRequest,
    event: Event,
    listener: any,
    options?: AddEventListenerOptions | boolean
  ) {
    if (typeof options === 'boolean') {
      const attachListener = options
        ? this.events.prependListener
        : this.events.addListener
      attachListener(event, listener)
    } else if (options?.once) {
      this.events.prependOnceListener(event, listener)
    } else if (options?.capture) {
      this.events.prependListener(event, listener)
    } else {
      this.events.addListener(event, listener)
    }

    return addEventListener.call(this, event, listener, options)
  }

  window.XMLHttpRequest.prototype.removeEventListener = function <
    Event extends keyof XMLHttpRequestEventTargetEventMap
  >(
    this: NodeXMLHttpRequest,
    event: Event,
    listener: any,
    options?: AddEventListenerOptions | boolean
  ) {
    this.events.removeListener(event, listener)
    return removeEventListener.call(this, event, listener, options)
  }

  window.XMLHttpRequest.prototype.setRequestHeader = function (
    this: NodeXMLHttpRequest,
    name,
    value
  ) {
    this.requestHeaders.set(name, value)
    return setRequestHeader.call(this, name, value)
  }

  window.XMLHttpRequest.prototype.getResponseHeader = function (
    this: NodeXMLHttpRequest,
    name
  ) {
    if (this.responseSource === 'bypass') {
      return getResponseHeader.call(this, name)
    }

    if (this.readyState < this.HEADERS_RECEIVED) {
      return null
    }

    const value = this.responseHeaders.get(name)
    return value
  }

  window.XMLHttpRequest.prototype.getAllResponseHeaders = function (
    this: NodeXMLHttpRequest
  ) {
    if (this.responseSource === 'bypass') {
      return getAllResponseHeaders.call(this)
    }

    if (this.readyState < this.HEADERS_RECEIVED) {
      return ''
    }

    return headersToString(this.responseHeaders)
  }

  /**
   * Custom prototype methods.
   */

  window.XMLHttpRequest.prototype.respondWith = function (response) {
    this.trigger('loadstart')

    const status = response.status || 200
    define.call(this, 'status', status)

    const statusText = response.statusText || 'OK'
    define.call(this, 'statusText', statusText)

    if (response.headers) {
      this.responseHeaders = new Headers(response.headers)
    }
    this.setReadyState(this.HEADERS_RECEIVED)

    this.responseContentType =
      this.getResponseHeader('content-type') || 'text/plain'

    //
    define.call(this, 'responseURL', this.url)
    define.call(this, 'responseText', response.body || '')
    define.call(this, 'responseXML', null)

    if (['text/xml', 'application/xml'].includes(this.responseContentType)) {
      const xml = new DOMParser().parseFromString(
        this.responseText,
        this.responseContentType
      )
      define.call(this, 'responseXML', xml)
    }

    // Set the "response" property according to the response content type.
    define.call(this, 'response', getResponse.call(this))

    const contentLength = this.responseHeaders.get('content-length') || '0'
    const bufferLength =
      parseInt(contentLength) || bufferFrom(this.responseText).length
    const progressInit: ProgressEventInit = {
      lengthComputable: false,
    }

    if (bufferLength > 0) {
      this.setReadyState(this.LOADING)
      progressInit.loaded = bufferLength
      progressInit.total = bufferLength
      this.trigger('progress', progressInit)
    }

    /**
     * Mark the request as done so it doesn't hang indefinitely.
     * @see https://github.com/mswjs/interceptors/issues/13
     */
    this.setReadyState(this.DONE)

    this.trigger('load')
    this.trigger('loadend')
  }

  window.XMLHttpRequest.prototype.trigger = function (
    event,
    options,
    customTarget
  ) {
    const target = customTarget || this
    const syntheticEvent = createEvent<XMLHttpRequestEventTarget>(
      target,
      event,
      options
    )

    // Dispatch event callbacks.
    // @ts-expect-error Dynamic object property.
    const callback = target[`on${event}`]
    callback?.call(target, syntheticEvent)

    // Call attached event listeners.
    for (const listener of target.events.listeners(event)) {
      listener.call(target, syntheticEvent)
    }
  }

  window.XMLHttpRequest.prototype.setReadyState = function (nextState) {
    if (this.readyState === nextState) {
      return
    }

    define.call(this, 'readyState', nextState)

    if (nextState !== this.UNSENT) {
      this.trigger('readystatechange')
    }
  }
}

function toIsomorphicRequest(
  this: NodeXMLHttpRequest,
  body?: any
): IsomorphicRequest {
  return {
    id: uuidv4(),
    url: new URL(this.url, document.baseURI),
    method: this.method,
    headers: this.requestHeaders,
    credentials: this.withCredentials ? 'include' : 'omit',
    body: body as any,
  }
}

function define<PropertyName extends keyof XMLHttpRequest>(
  this: NodeXMLHttpRequest,
  propertyName: PropertyName,
  value: XMLHttpRequest[PropertyName]
): void {
  const { enumerable, configurable } =
    Object.getOwnPropertyDescriptor(this, propertyName) || {}

  Object.defineProperty(this, propertyName, {
    enumerable,
    configurable,
    value,
  })
}

function getResponse(this: NodeXMLHttpRequest) {
  let response: unknown

  switch (this.responseType) {
    case 'arraybuffer': {
      response = bufferFrom(this.responseText)
      break
    }

    case 'blob': {
      response = new Blob([this.responseText], {
        type: this.responseContentType,
      })
      break
    }

    case 'document': {
      throw new Error(
        'NodeXMLHttpRequest: response type "document" is not supported.'
      )
    }

    case 'json': {
      // Invalid resopnse JSON must be reported to the consumer.
      response = JSON.parse(this.responseText)
      break
    }

    default: {
      response = this.responseText
      break
    }
  }

  return response
}
