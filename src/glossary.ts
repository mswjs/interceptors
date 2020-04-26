import { ClientRequestArgs } from 'http'

export type InterceptionEvent = 'request'

export type ClientRequestInput = string | URL | ClientRequestArgs

export interface InterceptedRequest {
  url: string
  method: string
}

export type RequestHandler = (req: InterceptedRequest) => void
