import { TextEncoder, TextDecoder } from 'util'

/**
 * @note Polyfilling text encoding API because they are not
 * supported in JSDOM. Standard in the browser, standard in Node.js
 * but not in JSDOM. Sadness.
 * @see https://github.com/jsdom/jsdom/issues/2524
 */
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', {
    enumerable: true,
    value: TextEncoder,
  })
}

if (typeof globalThis.TextDecoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextDecoder', {
    enumerable: true,
    value: TextDecoder,
  })
}
