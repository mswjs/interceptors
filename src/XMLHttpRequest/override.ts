import { ModuleOverride } from '../glossary'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'

const original = {
  XMLHttpRequest:
    // Although executed in node, certain processes emulate the DOM-like environment
    // (i.e. `js-dom` in Jest). The `window` object would be avilable in such environments.
    typeof window === 'undefined' ? undefined : window.XMLHttpRequest,
}

export const overrideXhrModule: ModuleOverride = (middleware) => {
  if (original.XMLHttpRequest) {
    const XMLHttpRequestOverride = createXMLHttpRequestOverride(
      middleware,
      original.XMLHttpRequest
    )

    // @ts-ignore
    window.XMLHttpRequest = XMLHttpRequestOverride
  }

  return () => {
    if (original.XMLHttpRequest) {
      window.XMLHttpRequest = original.XMLHttpRequest
    }
  }
}
