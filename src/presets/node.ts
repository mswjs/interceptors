import { ClientRequestInterceptor } from '../interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest/node'
import { FetchInterceptor } from '../interceptors/fetch/node'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (http/https/XMLHttpRequest).
 */
export default [
  new ClientRequestInterceptor(),
  new XMLHttpRequestInterceptor(),
  new FetchInterceptor(),
] as const
