import { Interceptor } from '../../glossary'
import { createXMLHttpRequestOverride } from './XMLHttpRequestOverride'

const debug = require('debug')('XHR')

const original = {
  XMLHttpRequest:
    // Although executed in node, certain processes emulate the DOM-like environment
    // (i.e. `js-dom` in Jest). The `window` object would be avilable in such environments.
    typeof window === 'undefined' ? undefined : window.XMLHttpRequest,
}

/**
 * Intercepts requests issued via `XMLHttpRequest`.
 */
export const interceptXMLHttpRequest: Interceptor = (middleware, context) => {
  if (original.XMLHttpRequest) {
    debug('patching "XMLHttpRequest" module...')

    const XMLHttpRequestOverride = createXMLHttpRequestOverride(
      middleware,
      context,
      original.XMLHttpRequest
    )

    // @ts-ignore
    window.XMLHttpRequest = XMLHttpRequestOverride
  }

  return () => {
    if (original.XMLHttpRequest) {
      debug('restoring patches...')

      window.XMLHttpRequest = original.XMLHttpRequest
    }
  }
}
