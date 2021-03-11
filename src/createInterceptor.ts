import { IncomingMessage } from 'http'
import { HeadersObject, Headers } from 'headers-utils'
import { StrictEventEmitter } from 'strict-event-emitter'

export type Interceptor = (
  observer: Observer,
  resolver: Resolver
) => InterceptorCleanupFn

export type Observer = StrictEventEmitter<InterceptorEventsMap>

/**
 * A side-effect function to restore all the patched modules.
 */
export type InterceptorCleanupFn = () => void

export interface IsomorphicRequest {
  url: URL
  method: string
  headers: HeadersObject
  body?: string
}

// Support legacy types so this is not a breaking change

export interface IsomorphicResponse {
  status: number
  statusText: string
  headers: Headers
  body?: string
}

// Support legacy types so this is not a breaking change?
export type IsomophricRequest = IsomorphicRequest
export type IsomophricResponse = IsomorphicResponse

export interface MockedResponse
  extends Omit<Partial<IsomorphicResponse>, 'headers'> {
  headers?: HeadersObject
}

interface InterceptorEventsMap {
  request(request: IsomorphicRequest): void
  response(request: IsomorphicRequest, response: IsomorphicResponse): void
}

export type Resolver = (
  request: IsomorphicRequest,
  ref: IncomingMessage | XMLHttpRequest | Request
) => MockedResponse | Promise<MockedResponse | void> | void

export interface InterceptorOptions {
  modules: Interceptor[]
  resolver: Resolver
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

export function createInterceptor(options: InterceptorOptions): InterceptorApi {
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
