import { ModuleOverride } from '../../glossary'
import { createXMLHttpRequestOverride } from './createXMLHttpRequestOverride'

const debug = require('debug')('XHR')

const original = {
  XMLHttpRequest:
    // Although executed in node, certain processes emulate the DOM-like environment
    // (i.e. `js-dom` in Jest). The `window` object would be avilable in such environments.
    typeof window === 'undefined' ? undefined : window.XMLHttpRequest,
}

/**
 * Conditionally overrides the `XMLHttpRequest` class using a given request middleware.
 */
export const overrideXhrModule: ModuleOverride = (middleware) => {
  if (original.XMLHttpRequest) {
    debug('patching "XMLHttpRequest" module...')

    const XMLHttpRequestOverride = createXMLHttpRequestOverride(
      middleware,
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
