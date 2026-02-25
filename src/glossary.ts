import type { RequestController } from './RequestController'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

/**
 * @note Export `RequestController` as a type only.
 * It's never meant to be created in the userland.
 */
export type { RequestController }

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export type HttpRequestEventMap = {
  request: [
    args: {
      initiator: unknown
      request: Request
      requestId: string
      controller: RequestController
    },
  ]
  response: [
    args: {
      initiator: unknown
      response: Response
      isMockedResponse: boolean
      request: Request
      requestId: string
    },
  ]
  unhandledException: [
    args: {
      error: unknown
      request: Request
      requestId: string
      controller: RequestController
    },
  ]
}
