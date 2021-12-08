import { debug } from 'debug'
import { Interceptor } from '../../createInterceptor'
import { patchXMLHttpRequest } from './patchXMLHttpRequest'

const log = debug('xhr')

const XMLHttpRequestOriginal =
  // Although executed in node, certain processes emulate the DOM-like environment
  // (i.e. "js-dom" in Jest). The "window" object would be avilable in such environments.
  typeof window === 'undefined' ? undefined : window.XMLHttpRequest

/**
 * Intercepts requests issued via "XMLHttpRequest".
 */
export const interceptXMLHttpRequest: Interceptor = (observer, resolver) => {
  if (XMLHttpRequestOriginal) {
    // Require the module conditionally because it extends "XMLHttpRequest"
    // which is not defined in Node.js by default.
    // const { NodeXMLHttpRequest } = require('./NodeXMLHttpRequest')
    log('patching "XMLHttpRequest" module...')

    // const { createOverride } = require('./WeirdXHR')
    // const NodeXMLHttpRequest = createOverride({
    //   XMLHttpRequest: XMLHttpRequestOriginal,
    //   prototype: XMLHttpRequestOriginal.prototype,
    //   resolver,
    //   observer,
    // })
    // NodeXMLHttpRequest.super = XMLHttpRequestOriginal
    // NodeXMLHttpRequest.observer = observer
    // NodeXMLHttpRequest.resolver = resolver
    // window.XMLHttpRequest = NodeXMLHttpRequest

    patchXMLHttpRequest({ resolver, observer })
  }

  return () => {
    if (XMLHttpRequestOriginal) {
      log('restoring modules...')
      window.XMLHttpRequest = XMLHttpRequestOriginal
    }
  }
}
