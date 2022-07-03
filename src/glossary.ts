import type { HeadersObject, Headers } from 'headers-polyfill'
import { IsomorphicRequest } from './IsomorphicRequest'
import type { LazyCallback } from './utils/createLazyCallback'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export class InteractiveIsomorphicRequest extends IsomorphicRequest {
  constructor(
    request: IsomorphicRequest,
    readonly respondWith: LazyCallback<(mockedResponse: MockedResponse) => void>
  ) {
    super(request)
    this.id = request.id
  }
}

export interface IsomorphicResponse {
  status: number
  statusText: string
  headers: Headers
  body?: string
}

export interface MockedResponse
  extends Omit<Partial<IsomorphicResponse>, 'headers'> {
  headers?: HeadersObject
}

export type HttpRequestEventMap = {
  request(request: InteractiveIsomorphicRequest): Promise<void> | void
  response(
    request: IsomorphicRequest,
    response: IsomorphicResponse
  ): Promise<void> | void
}
