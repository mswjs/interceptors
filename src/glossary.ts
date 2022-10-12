import type { InteractiveIsomorphicRequest } from './InteractiveIsomorphicRequest'
import type { IsomorphicRequest } from './IsomorphicRequest'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export type HttpRequestEventMap = {
  request(request: InteractiveIsomorphicRequest): Promise<void> | void
  response(request: IsomorphicRequest, response: Response): Promise<void> | void
}
