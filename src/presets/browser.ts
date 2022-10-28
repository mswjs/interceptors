import { FetchInterceptor } from '../interceptors/fetch'
import { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest'
import { SendBeaconInterceptor } from '../interceptors/sendBeacon'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (fetch/XMLHttpRequest).
 */
export default [
  new FetchInterceptor(),
  new XMLHttpRequestInterceptor(),
  new SendBeaconInterceptor(),
]
