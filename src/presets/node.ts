import { interceptXMLHttpRequest } from '../interceptors/XMLHttpRequest'

/**
 * The default preset provisions the interception of requests
 * regardless of their type (http/https/XMLHttpRequest).
 */
export default [interceptXMLHttpRequest]
