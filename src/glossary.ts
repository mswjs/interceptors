import { IncomingMessage } from 'http'

/**
 * A module override function that accepts a request middleware
 * and returns a cleanup function that restores all the patched modules.
 */
export type ModuleOverride = (handler: RequestMiddleware) => () => void

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
  body: string
}
