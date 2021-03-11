import { interceptXMLHttpRequest } from '../interceptors/XMLHttpRequest'
import { interceptFetch } from '../interceptors/fetch'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (fetch/XMLHttpRequest).
 */
export default [interceptXMLHttpRequest, interceptFetch]
