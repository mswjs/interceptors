import { FetchInterceptor } from '../interceptors/fetch/web'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest/web'

/**
 * A browser preset for the request interception regardless
 * of their initiator (fetch, XMLHttpRequest).
 */
export default [
  new FetchInterceptor(),
  new XMLHttpRequestInterceptor(),
] as const
