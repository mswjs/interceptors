import { IncomingMessage } from 'http'

export type InterceptionEvent = 'request'

export type HttpRequestCallback = (res: IncomingMessage) => void

export interface InterceptedRequest {
  url: string
  method: string
}

export type RequestHandler = (
  req: InterceptedRequest,
  ref: IncomingMessage
) => Partial<MockedResponse> | undefined

export interface MockedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
