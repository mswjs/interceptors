import { IncomingMessage } from 'http'

export type InterceptionEvent = 'request'

export type HttpRequestCallback = (res: IncomingMessage) => void

export interface InterceptedRequest {
  url: string
  method: string
}

export type ReturnedResponse = Partial<MockedResponse> | void

export type RequestHandler = (
  req: InterceptedRequest,
  ref: IncomingMessage | XMLHttpRequest
) => ReturnedResponse | Promise<ReturnedResponse>

export interface MockedResponse {
  status: number
  statusText: string
  headers: Record<string, string | string[]>
  body: string
}
