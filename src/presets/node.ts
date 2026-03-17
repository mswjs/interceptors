import { ClientRequestInterceptor } from '../interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest/node'
import { FetchInterceptor } from '../interceptors/fetch/node'

/**
 * A Node.js preset for the request interception regardless
 * of their initiator (http, fetch, XMLHttpRequest).
 */
export default [
  new ClientRequestInterceptor(),
  new XMLHttpRequestInterceptor(),
  new FetchInterceptor(),
] as const
