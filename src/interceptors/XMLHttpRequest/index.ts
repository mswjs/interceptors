import { Interceptor } from '../../createInterceptor'
import { createXMLHttpRequestOverride } from './XMLHttpRequestOverride'

const debug = require('debug')('XHR')

const pureXMLHttpRequest =
  // Although executed in node, certain processes emulate the DOM-like environment
  // (i.e. `js-dom` in Jest). The `window` object would be avilable in such environments.
  typeof window === 'undefined' ? undefined : window.XMLHttpRequest

/**
 * Intercepts requests issued via `XMLHttpRequest`.
 */
export const interceptXMLHttpRequest: Interceptor = (observer, resolver) => {
  if (pureXMLHttpRequest) {
    debug('patching "XMLHttpRequest" module...')

    const XMLHttpRequestOverride = createXMLHttpRequestOverride({
      pureXMLHttpRequest,
      observer,
      resolver,
    })

    window.XMLHttpRequest = XMLHttpRequestOverride
  }

  return () => {
    if (pureXMLHttpRequest) {
      debug('restoring modules...')

      window.XMLHttpRequest = pureXMLHttpRequest
    }
  }
}
