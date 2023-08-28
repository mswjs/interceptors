export const TextEncoder: typeof globalThis.TextEncoder =
  typeof globalThis.TextEncoder === 'undefined'
    ? require('node:util').TextEncoder
    : globalThis.TextEncoder

export const TextDecoder: typeof globalThis.TextDecoder =
  typeof globalThis.TextDecoder === 'undefined'
    ? require('node:util').TextDecoder
    : globalThis.TextDecoder
