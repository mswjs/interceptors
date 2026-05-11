import { TypedEvent } from 'rettime'
import type { RequestController } from '../RequestController'

export interface HttpRequestEventData {
  request: Request
  requestId: string
  initiator: unknown
  controller: RequestController
}

export class HttpRequestEvent<
  DataType extends HttpRequestEventData = HttpRequestEventData,
> extends TypedEvent<DataType, void, 'request'> {
  public request: Request
  public requestId: string
  public initiator: unknown
  public controller: RequestController

  constructor(data: DataType) {
    super(...(['request', {}] as any))

    this.request = data.request
    this.requestId = data.requestId
    this.initiator = data.initiator
    this.controller = data.controller
  }
}

export type HttpResponseType = 'mock' | 'original'

interface HttpResponseEventData {
  response: Response
  responseType: HttpResponseType
  request: Request
  requestId: string
  initiator: unknown
}

export class HttpResponseEvent<
  DataType extends HttpResponseEventData = HttpResponseEventData,
> extends TypedEvent<DataType, void, 'response'> {
  public response: Response
  public responseType: HttpResponseType
  public request: Request
  public requestId: string
  public initiator: unknown

  constructor(data: DataType) {
    super(...(['response', {}] as any))

    this.response = data.response
    this.responseType = data.responseType
    this.request = data.request
    this.requestId = data.requestId
    this.initiator = data.initiator
  }
}

interface UnhandledHttpExceptionEventData {
  error: unknown
  request: Request
  requestId: string
  initiator: unknown
  controller: RequestController
}

export class UnhandledHttpException<
  DataType extends UnhandledHttpExceptionEventData =
    UnhandledHttpExceptionEventData,
> extends TypedEvent<DataType, void, 'unhandledException'> {
  public error: unknown
  public request: Request
  public requestId: string
  public initiator: unknown
  public controller: RequestController

  constructor(data: DataType) {
    super(...(['unhandledException', {}] as any))

    this.error = data.error
    this.request = data.request
    this.requestId = data.requestId
    this.initiator = data.initiator
    this.controller = data.controller
  }
}

export type HttpRequestEventMap = {
  request: HttpRequestEvent
  response: HttpResponseEvent
  unhandledException: UnhandledHttpException
}
