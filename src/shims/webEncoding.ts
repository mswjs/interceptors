export const TextEncoder: typeof globalThis.TextEncoder =
  typeof globalThis.TextEncoder === 'undefined'
    ? require('util').TextEncoder
    : globalThis.TextEncoder

export const TextDecoder: typeof globalThis.TextDecoder =
  typeof globalThis.TextDecoder === 'undefined'
    ? require('util').TextDecoder
    : globalThis.TextDecoder
