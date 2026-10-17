/**
 * Create a network error the way the native `fetch` of the current
 * runtime does: Undici (Node.js) rejects with "fetch failed",
 * browsers with "Failed to fetch".
 */
export function createNetworkError(cause?: unknown) {
  const message =
    typeof process !== 'undefined' && process.versions?.node != null
      ? 'fetch failed'
      : 'Failed to fetch'

  return Object.assign(new TypeError(message), {
    cause,
  })
}
