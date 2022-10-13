import type { InteractiveRequest } from './utils/toInteractiveRequest'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export type HttpRequestEventMap = {
  request(request: InteractiveRequest, requestId: string): Promise<void> | void
  response(request: Request, response: Response): Promise<void> | void
}
