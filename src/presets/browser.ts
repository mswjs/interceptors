import { FetchInterceptor } from '../interceptors/fetch'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest/web'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (fetch/XMLHttpRequest).
 */
export default [
  new FetchInterceptor(),
  new XMLHttpRequestInterceptor(),
] as const
