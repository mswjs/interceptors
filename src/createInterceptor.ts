import { IncomingMessage } from 'http'
import { HeadersObject, Headers } from 'headers-polyfill'
import { StrictEventEmitter } from 'strict-event-emitter'
import { WebSocketConnection } from './interceptors/WebSocket/browser/WebSocketOverride'

export type Interceptor<EventType extends ResolverEventType> = (
  observer: Observer,
  resolver: Resolver<ResolverEventsMap[EventType]>
) => InterceptorCleanupFn

export type Observer = StrictEventEmitter<InterceptorEventsMap>

/**
 * A side-effect function to restore all the patched modules.
 */
export type InterceptorCleanupFn = () => void

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export interface IsomorphicRequest {
  id: string
  url: URL
  method: string
  headers: Headers
  /**
   * The value of the request client's "credentials" option
   * or a compatible alternative (i.e. `withCredentials` for `XMLHttpRequest`).
   * Always equals to "omit" in Node.js.
   */
  credentials: RequestCredentials
  body?: string
}

export interface IsomorphicResponse {
  status: number
  statusText: string
  headers: Headers
  body?: string
}

export interface MockedResponse
  extends Omit<Partial<IsomorphicResponse>, 'headers'> {
  headers?: HeadersObject
}

export interface InterceptorEventsMap {
  request(request: IsomorphicRequest): void
  response(request: IsomorphicRequest, response: IsomorphicResponse): void
}

export type ResolverEventType = 'http' | 'websocket'

export interface IsomorphicEvent {
  source: ResolverEventType
  timeStamp: number
}

export type MaybePromise<ValueType> = Promise<ValueType> | ValueType

export interface HttpRequestEvent extends IsomorphicEvent {
  source: 'http'
  request: IsomorphicRequest
  target: IncomingMessage | XMLHttpRequest | Request
  respondWith(response: MaybePromise<MockedResponse | void>): void
}

export interface WebSocketEvent extends IsomorphicEvent {
  source: 'websocket'
  target: WebSocket
  connection: WebSocketConnection
}

export interface ResolverEventsMap {
  http: HttpRequestEvent
  websocket: WebSocketEvent
}

export type ResolverEvent = HttpRequestEvent | WebSocketEvent

export type Resolver<Event extends ResolverEvent = HttpRequestEvent> = (
  event: Event
) => MaybePromise<void>

export interface InterceptorOptions<Interceptors extends Interceptor<any>[]> {
  modules: Interceptors
  resolver: Resolver<
    Interceptors extends Array<infer InterceptorType>
      ? InterceptorType extends Interceptor<infer EventType>
        ? EventType extends 'http'
          ? HttpRequestEvent
          : EventType extends 'websocket'
          ? WebSocketEvent
          : never
        : never
      : never
  >
}

export interface InterceptorApi {
  /**
   * Apply necessary module patches to provision the interception of requests.
   */
  apply(): void

  on<Event extends keyof InterceptorEventsMap>(
    event: Event,
    listener: InterceptorEventsMap[Event]
  ): void

  /**
   * Restore all applied module patches and disable the interception.
   */
  restore(): void
}

export function createInterceptor<Interceptors extends Interceptor<any>[]>(
  options: InterceptorOptions<Interceptors>
): InterceptorApi {
  const observer = new StrictEventEmitter<InterceptorEventsMap>()
  let cleanupFns: InterceptorCleanupFn[] = []

  return {
    apply() {
      cleanupFns = options.modules.map((interceptor) => {
        return interceptor(observer, options.resolver)
      })
    },
    on(event, listener) {
      observer.addListener(event, listener)
    },
    restore() {
      observer.removeAllListeners()

      if (cleanupFns.length === 0) {
        throw new Error(
          `Failed to restore patched modules: no patches found. Did you forget to run ".apply()"?`
        )
      }

      cleanupFns.forEach((restore) => restore())
    },
  }
}
