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
import { getRequestBodyLength } from './utils/getRequestBodyLength'

export interface NodeXMLHttpRequestOptions {
  observer: Observer
  resolver: Resolver
}

export type XMLHttpRequestBodyType =
  | Document
  | BodyInit
  | string
  | null
  | undefined

export type XMLHttpRequestListener<
  Context extends any,
  Event extends keyof EventsMap,
  EventsMap extends XMLHttpRequestEventTargetEventMap
> = (this: Context, event: EventsMap[Event]) => void

type EventMapToListeners<
  Context extends any,
  EventsMap extends XMLHttpRequestEventTargetEventMap
> = {
  [Event in keyof EventsMap]: XMLHttpRequestListener<Context, Event, EventsMap>
}

declare global {
  export interface XMLHttpRequestUpload {
    events: StrictEventEmitter<
      EventMapToListeners<
        XMLHttpRequestUpload,
        XMLHttpRequestEventTargetEventMap
      >
    >
  }
}

export class NodeXMLHttpRequest extends XMLHttpRequest {
  private log: Debugger

  private method: string
  private url: string
  private events: StrictEventEmitter<
    EventMapToListeners<XMLHttpRequest, XMLHttpRequestEventTargetEventMap>
  >
  private requestHeaders: Headers
  private requestBodyLength: number
  private responseHeaders: Headers
  private responseSource: 'mock' | 'bypass' = 'mock'

  public static observer: Observer
  public static resolver: Resolver

  constructor() {
    super()

    this.log = debug('xhr')
    this.events = new StrictEventEmitter()

    this.upload.events = new StrictEventEmitter()
    this.spyOnUploadEvents()

    this.method = ''
    this.url = ''
    this.requestHeaders = new Headers()
    this.requestBodyLength = 0
    this.responseHeaders = new Headers()
  }

  private spyOnUploadEvents(): void {
    const { addEventListener, removeEventListener } = this.upload

    this.upload.addEventListener = function <
      Event extends keyof XMLHttpRequestEventTargetEventMap
    >(
      name: Event,
      listener: (
        this: XMLHttpRequestUpload,
        event: XMLHttpRequestEventTargetEventMap[Event]
      ) => void,
      options?: boolean | AddEventListenerOptions
    ) {
      this.events.addListener(name, listener)
      return addEventListener(name, listener, options)
    }

    this.upload.removeEventListener = function (name: any, listener: any) {
      this.events.removeListener(name, listener)
      return removeEventListener(name, listener)
    }
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
  send(body?: XMLHttpRequestBodyType): void {
    this.log('send:', body, this.readyState)

    // Set the request body length later used by progress events.
    this.setRequestBodyLength(body)

    const isomorphicRequest = this.toIsomorphicRequest(body)
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

        // Trigger upload events.
        if (!this.requestHeaders.has('content-length')) {
          this.requestHeaders.set(
            'content-length',
            this.requestBodyLength.toString()
          )
        }

        const requestBodyLength = parseInt(
          this.requestHeaders.get('content-length') || ' 0'
        )

        const lengthComputable = requestBodyLength > 0
        this.trigger(
          'loadstart',
          {
            lengthComputable,
            loaded: 0,
            total: requestBodyLength,
          },
          this.upload
        )

        const doneProgressInit: ProgressEventInit = {
          lengthComputable,
          loaded: requestBodyLength,
          total: requestBodyLength,
        }
        this.trigger('progress', doneProgressInit, this.upload)
        this.trigger('load', doneProgressInit, this.upload)
        this.trigger('loadend', doneProgressInit, this.upload)

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

      return super.send(body)
    })
  }

  addEventListener<Event extends keyof XMLHttpRequestEventTargetEventMap>(
    event: Event,
    listener: (
      this: XMLHttpRequest,
      event: XMLHttpRequestEventTargetEventMap[Event]
    ) => void,
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
    listener: (
      this: XMLHttpRequest,
      event: XMLHttpRequestEventTargetEventMap[Event]
    ) => void,
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
    options?: ProgressEventInit,
    target?: NodeXMLHttpRequest | XMLHttpRequestUpload
  ): void {
    this.log('trigger "%s"', event, this.readyState)

    const resolvedTarget = target || this
    const synthenicEvent = createEvent<XMLHttpRequestEventTarget>(
      resolvedTarget,
      event,
      options
    )

    const callback =
      // @ts-expect-error Dynamic access to class properties.
      resolvedTarget[`on${event}`] as XMLHttpRequestListener<
        typeof resolvedTarget,
        Event,
        XMLHttpRequestEventMap
      >
    callback?.call(resolvedTarget, synthenicEvent)

    for (const listener of (
      resolvedTarget as NodeXMLHttpRequest
    ).events.listeners(event)) {
      listener.call(resolvedTarget, synthenicEvent)
    }
  }

  private setRequestBodyLength(body: XMLHttpRequestBodyType): void {
    this.requestBodyLength = this.requestHeaders.has('content-length')
      ? parseInt(this.requestHeaders.get('content-length')!)
      : getRequestBodyLength(body)
  }

  private toIsomorphicRequest(
    data?: XMLHttpRequestBodyType
  ): IsomorphicRequest {
    return {
      id: uuidv4(),
      method: this.method,
      url: new URL(this.url, document.baseURI),
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

    // Compose and trigger the "progress" event.
    const contentLength = this.responseHeaders.get('content-length') || '0'
    const bodyBuffer = bufferFrom(response.body || '')
    const bufferLength = parseInt(contentLength) || bodyBuffer.length
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
