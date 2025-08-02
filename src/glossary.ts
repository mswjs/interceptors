import type { DefaultEventMap } from 'rettime'
import type { RequestController } from './RequestController'
import type {
  HttpRequestEvent,
  HttpResponseEvent,
  HttpUnhandledExceptionEvent,
} from './events'

export const IS_PATCHED_MODULE: unique symbol = Symbol('isPatchedModule')

/**
 * @note Export `RequestController` as a type only.
 * It's never meant to be created in the userland.
 */
export type { RequestController }

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

export interface HttpRequestEventMap extends DefaultEventMap {
  request: HttpRequestEvent
  response: HttpResponseEvent
  unhandledException: HttpUnhandledExceptionEvent
}
