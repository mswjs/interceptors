import { FetchInterceptor } from 'src/interceptors/fetch'
import { ClientRequestInterceptor } from '../interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (http/https/XMLHttpRequest).
 */
export default [
  new ClientRequestInterceptor(),
  new XMLHttpRequestInterceptor(),
  new FetchInterceptor(),
] as const
