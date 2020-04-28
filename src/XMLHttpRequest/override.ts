import { ModuleOverride } from '../glossary'
import { createXMLHttpRequestOverride } from './XMLHttpRequest/XMLHttpRequestOverride'

const original = {
  XMLHttpRequest: window?.XMLHttpRequest,
}

export const overrideXhrModule: ModuleOverride = (middleware) => {
  // Although executed in node, certain processes emulate the DOM-like environment
  // (i.e. `js-dom` in Jest). The `window` object would be avilable in such environments.
  const isBrowserLikeEnvironment = typeof window !== 'undefined'

  if (isBrowserLikeEnvironment) {
    const XMLHttpRequestOverride = createXMLHttpRequestOverride(
      middleware,
      original.XMLHttpRequest
    )

    // @ts-ignore
    window.XMLHttpRequest = XMLHttpRequestOverride
  }

  return () => {
    if (isBrowserLikeEnvironment) {
      window.XMLHttpRequest = original.XMLHttpRequest
    }
  }
}
