import { debug } from 'debug'
import { Interceptor } from '../../createInterceptor'

const log = debug('xhr')

const pureXMLHttpRequest =
  // Although executed in node, certain processes emulate the DOM-like environment
  // (i.e. "js-dom" in Jest). The "window" object would be avilable in such environments.
  typeof window === 'undefined' ? undefined : window.XMLHttpRequest

/**
 * Intercepts requests issued via "XMLHttpRequest".
 */
export const interceptXMLHttpRequest: Interceptor = (observer, resolver) => {
  if (pureXMLHttpRequest) {
    // Require the module conditionally because it extends "XMLHttpRequest"
    // which is not defined in Node.js by default.
    const { NodeXMLHttpRequest } = require('./NodeXMLHttpRequest')
    log('patching "XMLHttpRequest" module...')

    NodeXMLHttpRequest.observer = observer
    NodeXMLHttpRequest.resolver = resolver
    window.XMLHttpRequest = NodeXMLHttpRequest
  }

  return () => {
    if (pureXMLHttpRequest) {
      log('restoring modules...')
      window.XMLHttpRequest = pureXMLHttpRequest
    }
  }
}
