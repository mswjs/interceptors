import type { InteractiveRequest } from './utils/toInteractiveRequest'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export type HttpRequestEventMap = {
  request: [
    args: {
      request: InteractiveRequest
      requestId: string
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
      controller: {
        respondWith(response: Response): void
        errorWith(error?: Error): void
      }
    }
  ]
}
