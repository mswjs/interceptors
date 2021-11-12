import { Debugger, debug } from 'debug'
import { until } from '@open-draft/until'
import { Headers, headersToString, stringToHeaders } from 'headers-utils'
import {
  IsomorphicRequest,
  IsomorphicResponse,
  MockedResponse,
  Observer,
  Resolver,
} from '../../createInterceptor'
import { uuidv4 } from '../../utils/uuid'
import { createEvent } from './utils/createEvent'
import { StrictEventEmitter } from 'strict-event-emitter'
import { parseJson } from '../../utils/parseJson'
import { bufferFrom } from './utils/bufferFrom'
import { DOMParser } from '@xmldom/xmldom'
import { toIsoResponse } from '../../utils/toIsoResponse'

export interface NodeXMLHttpRequestOptions {
  observer: Observer
  resolver: Resolver
}

export type XMLHttpRequestData = Document | BodyInit | null | undefined

export type XMLHttpRequestEventHandler<
  Event extends keyof XMLHttpRequestEventTargetEventMap
> = (
  this: XMLHttpRequest,
  event: XMLHttpRequestEventTargetEventMap[Event]
) => void

type XMLHttpRequestEventsMap = {
  [Event in keyof XMLHttpRequestEventMap]: (
    event: XMLHttpRequestEventMap[Event]
  ) => void
}

export class NodeXMLHttpRequest extends XMLHttpRequest {
  private log: Debugger

  private method: string
  private url: string
  private events: StrictEventEmitter<XMLHttpRequestEventsMap>
  private requestHeaders: Headers
  private responseHeaders: Headers
  private responseSource: 'mock' | 'bypass' = 'mock'

  public static observer: Observer
  public static resolver: Resolver

  constructor() {
    super()

    this.log = debug('xhr')
    this.events = new StrictEventEmitter()

    this.method = ''
    this.url = ''
    this.requestHeaders = new Headers()
    this.responseHeaders = new Headers()
  }

  open(
    method: string,
    url: string,
    async: boolean = true,
    user?: string | null,
    password?: string | null
  ): void {
    this.log = debug(`xhr ${method} ${url}`)
    this.log('open', { async, user, password })

    this.method = method
    this.url = url

    return super.open(method, url, async, user, password)
  }

  /**
   * @note The "send" method must remain synchronous.
   */
  send(data?: XMLHttpRequestData): void {
    this.log('send:', data, this.readyState)

    const isomorphicRequest = this.toIsomorphicRequest(data)
    NodeXMLHttpRequest.observer.emit('request', isomorphicRequest)

    this.log('executing response resolver...')
    until(async () =>
      NodeXMLHttpRequest.resolver(isomorphicRequest, this)
    ).then(([resolverError, mockedResponse]) => {
      if (resolverError) {
        this.log('resolver threw an exception!', resolverError)
        this.trigger('error')
        this.abort()

        return
      }

      if (mockedResponse) {
        this.log('received mocked response:', mockedResponse)

        this.respondWith(mockedResponse)
        NodeXMLHttpRequest.observer.emit(
          'response',
          isomorphicRequest,
          toIsoResponse(mockedResponse)
        )

        this.log(
          '%s %s (MOCKED)',
          mockedResponse.status,
          mockedResponse.statusText
        )

        return
      }

      this.responseSource = 'bypass'
      this.addEventListener('loadend', () => {
        this.log('%s %s (ORIGINAL)', this.status, this.statusText)

        if (!this.status) {
          this.log('response aborted or timed out, skipping...')
          return
        }

        const rawResponseHeaders = this.getAllResponseHeaders()
        this.log('original response headers:\n', rawResponseHeaders)

        if (rawResponseHeaders) {
          this.responseHeaders = stringToHeaders(rawResponseHeaders)
          this.log('converted to headers:\n', this.responseHeaders)
        }

        const isomorphicResponse: IsomorphicResponse = {
          status: this.status,
          statusText: this.statusText,
          headers: this.responseHeaders,
          body: this.response,
        }
        this.log('isomorphic response:', isomorphicResponse)

        NodeXMLHttpRequest.observer.emit(
          'response',
          isomorphicRequest,
          isomorphicResponse
        )
      })

      return super.send(data)
    })
  }

  addEventListener<Event extends keyof XMLHttpRequestEventTargetEventMap>(
    event: Event,
    listener: XMLHttpRequestEventHandler<Event>,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.log('add event listener "%s"', event)

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

    return super.addEventListener(event, listener, options)
  }

  removeEventListener<Event extends keyof XMLHttpRequestEventTargetEventMap>(
    event: Event,
    listener: XMLHttpRequestEventHandler<Event>,
    options?: boolean | EventListenerOptions
  ): void {
    this.log('remove event listener "%s"', event)

    this.events.removeListener(event, listener)
    return super.removeEventListener(event, listener, options)
  }

  setRequestHeader(name: string, value: string): void {
    this.log('set request header "%s": %s', name, value)
    this.requestHeaders.set(name, value)
    return super.setRequestHeader(name, value)
  }

  getResponseHeader(name: string): string | null {
    this.log('get response header "%s"', name)

    if (this.responseSource === 'bypass') {
      this.log('returning the original header...')
      return super.getResponseHeader(name)
    }

    if (this.readyState < this.HEADERS_RECEIVED) {
      this.log(
        'failed to return a "%s" header: headers not received',
        name,
        this.readyState
      )
      return null
    }

    const value = this.responseHeaders.get(name)
    this.log('resolved response header "%s": %s', name, value)

    return value
  }

  getAllResponseHeaders(): string {
    this.log('get all response headers...')

    if (this.responseSource === 'bypass') {
      this.log('in bypass mode, execute native method...')
      return super.getAllResponseHeaders()
    }

    if (this.readyState < this.HEADERS_RECEIVED) {
      this.log(
        'failed to return a "%s" header: headers not received',
        this.readyState
      )
      return ''
    }

    return headersToString(this.responseHeaders)
  }

  private trigger<Event extends keyof XMLHttpRequestEventMap>(
    event: Event,
    options?: Event extends 'progress' ? ProgressEventInit : never
  ): void {
    this.log('trigger "%s"', event, this.readyState)
    const synthenicEvent = createEvent<XMLHttpRequestEventTarget>(
      this,
      event,
      options
    )

    // @ts-expect-error
    const callback = this[`on${event}`] as XMLHttpRequestEventHandler<Event>
    callback?.call(this, synthenicEvent as any)

    for (const listener of this.events.listeners(event)) {
      listener.call(this, synthenicEvent)
    }
  }

  private toIsomorphicRequest(data?: XMLHttpRequestData): IsomorphicRequest {
    let url: URL

    try {
      url = new URL(this.url)
    } catch (error) {
      // Assume a relative URL, if construction of a new `URL` instance fails.
      // Since `XMLHttpRequest` always executed in a DOM-like environment,
      // resolve the relative request URL against the current window location.
      url = new URL(this.url, window.location.href)
    }

    return {
      id: uuidv4(),
      method: this.method,
      url,
      headers: this.requestHeaders,
      credentials: this.withCredentials ? 'include' : 'omit',
      /**
       * @fixme Handle other "data" value types (Document, BodyInit).
       */
      body: data as string,
    }
  }

  private setReadyState(nextState: number): void {
    this.log('set ready state: %d -> %d', this.readyState, nextState)
    if (nextState === this.readyState) {
      this.log('ready state match, skipping...')
      return
    }

    this.define('readyState', nextState)
    this.log('set ready state to %d!', nextState)

    if (nextState !== this.UNSENT) {
      this.trigger('readystatechange')
    }
  }

  private respondWith(response: MockedResponse): void {
    this.log('responding with mocked resopnse:', response)

    this.trigger('loadstart')
    this.define('status', response.status || 200)
    this.define('statusText', response.statusText || 'OK')

    // Set response headers.
    if (response.headers) {
      this.responseHeaders = new Headers(response.headers)
    }

    this.setReadyState(this.HEADERS_RECEIVED)
    const contentType = this.getResponseHeader('content-type') || 'text/plain'

    // Set the explicit "response*" properties.
    this.define('responseURL', this.url)
    this.define('responseText', response.body || '')
    this.define('responseXML', null)

    if (contentType === 'application/xml' || contentType === 'text/xml') {
      const xml = new DOMParser().parseFromString(
        this.responseText,
        contentType
      )
      this.define('responseXML', xml)
    }

    // Set the "response" property.
    this.log('setting "response" for type "%s"', this.responseType)
    switch (this.responseType) {
      case 'arraybuffer': {
        const arrayBuffer = bufferFrom(this.responseText)
        this.define('response', arrayBuffer)
        break
      }

      case 'blob': {
        const blob = new Blob([this.responseText], { type: contentType })
        this.define('response', blob)
        break
      }

      case 'document': {
        throw new Error(
          'NodeXMLHttpRequest: response type "document" is not supported.'
        )
      }

      case 'json': {
        this.define('response', parseJson(this.responseText))
        break
      }

      default: {
        this.define('response', this.responseText)
        break
      }
    }

    if (response.body && this.response) {
      this.setReadyState(this.LOADING)

      const bodyBuffer = bufferFrom(response.body)
      this.trigger('progress', {
        loaded: bodyBuffer.length,
        total: bodyBuffer.length,
      })
    }

    /**
     * Explicitly mark the request as done so its response never hangs.
     * @see https://github.com/mswjs/interceptors/issues/13
     */
    this.setReadyState(this.DONE)

    this.trigger('load')
    this.trigger('loadend')
  }

  private define<PropertyName extends keyof XMLHttpRequest>(
    propertyName: PropertyName,
    value: XMLHttpRequest[PropertyName]
  ): void {
    Object.defineProperty(this, propertyName, {
      enumerable: true,
      configurable: true,
      value,
    })
  }
}
