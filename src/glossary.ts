import { ClientRequestArgs } from 'http'

export type InterceptionEvent = 'request'

export type ClientRequestInput = string | URL | ClientRequestArgs

export interface InterceptedRequest {
  url: string
  method: string
}

export type RequestHandler = (
  req: InterceptedRequest
) => Partial<MockedResponse> | undefined

export interface MockedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
