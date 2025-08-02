import { TypedEvent } from 'rettime'
import type { RequestController } from './RequestController'

export class HttpRequestEvent<
  DataType = void,
  ReturnType = void,
  EventType extends string = string
> extends TypedEvent<void, ReturnType, EventType> {
  public requestId: string
  public request: Request
  public controller: RequestController

  constructor(
    type: EventType,
    init: {
      requestId: string
      request: Request
      controller: RequestController
    }
  ) {
    super(type, {})

    this.requestId = init.requestId
    this.request = init.request
    this.controller = init.controller
  }
}

export class HttpResponseEvent<
  DataType = void,
  ReturnType = void,
  EventType extends string = string
> extends TypedEvent<void, ReturnType, EventType> {
  public requestId: string
  public request: Request
  public response: Response
  public isMockedResponse: boolean

  constructor(
    type: EventType,
    init: {
      requestId: string
      request: Request
      response: Response
      isMockedResponse: boolean
    }
  ) {
    super(type, {})

    this.requestId = init.requestId
    this.request = init.request
    this.response = init.response
    this.isMockedResponse = init.isMockedResponse
  }
}

export class HttpUnhandledExceptionEvent<
  DataType = void,
  ReturnType = void,
  EventType extends string = string
> extends TypedEvent<void, ReturnType, EventType> {
  public requestId: string
  public request: Request
  public controller: RequestController
  public error: unknown

  constructor(
    type: EventType,
    init: {
      requestId: string
      request: Request
      controller: RequestController
      error: Error
    }
  ) {
    super(type, {})

    this.requestId = init.requestId
    this.request = init.request
    this.controller = init.controller
    this.error = init.error
  }
}
