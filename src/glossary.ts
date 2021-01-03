import { IncomingMessage } from 'http'
import { StrictEventEmitter } from 'strict-event-emitter'

// Request instance constructed by the `request` library
// has a `self` property that has a `uri` field. This is
// reproducible by performing a `XMLHttpRequest` request (jsdom).
export interface RequestSelf {
  uri?: URL
}

export interface RequestInterceptorContext {
  emitter: StrictEventEmitter<RequestInterceptorEventsMap>
}

/**
 * A module override function that accepts a request middleware
 * and returns a cleanup function that restores all the patched modules.
 */
export type Interceptor = (
  middleware: RequestMiddleware,
  context: RequestInterceptorContext
) => () => void

export type HttpRequestCallback = (res: IncomingMessage) => void

export interface InterceptedRequest {
  url: URL
  method: string
  headers?: Record<string, string | string[]>
  body?: string | undefined
}

export type ReturnedResponse = Partial<MockedResponse> | void

export type RequestMiddleware = (
  req: InterceptedRequest,
  ref: IncomingMessage | XMLHttpRequest
) => ReturnedResponse | Promise<ReturnedResponse>

export interface MockedResponse {
  status: number
  statusText: string
  headers: Record<string, string | string[]>
  body: string | undefined
}

export interface RequestInterceptorEventsMap {
  response: (req: InterceptedRequest, res: MockedResponse) => void
}
