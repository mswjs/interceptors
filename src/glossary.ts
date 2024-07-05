import type { RequestController } from './RequestController'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export type HttpRequestEventMap = {
  request: [
    args: {
      request: Request
      requestId: string
      controller: RequestController
    }
  ]
  response: [
    args: {
      response: Response
      isMockedResponse: boolean
      request: Request
      requestId: string
    }
  ]
  unhandledException: [
    args: {
      error: unknown
      request: Request
      requestId: string
      controller: RequestController
    }
  ]
}
