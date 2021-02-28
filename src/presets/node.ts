import { interceptClientRequest } from '../interceptors/ClientRequest'
import { interceptXMLHttpRequest } from '../interceptors/XMLHttpRequest'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (http/https/XMLHttpRequest).
 */
export default [interceptClientRequest, interceptXMLHttpRequest]
