import { invariant } from 'outvariant'

const WEBSOCKET_ERROR_PREFIX = `Syntax Error: Failed to construct 'WebSocket'`

/**
 * Validate the given WebSocket URL string.
 */
export function parseWebSocketUrl(url?: string | null): URL {
  invariant(url, 'SyntaxError: 1 argument required, but only 0 present.')

  const urlRecord = new URL(url)

  // URL must have a protocol specified.
  invariant(
    urlRecord.protocol !== '',
    `%s: The URL '%s' is invalid.`,
    WEBSOCKET_ERROR_PREFIX,
    urlRecord.toString()
  )

  // Forbid invalid WebSocket protocols.
  invariant(
    urlRecord.protocol === 'wss:' || urlRecord.protocol === 'ws:',
    `%s: The URL's scheme must be either 'ws' or 'wss'. '%s' is not allowed.`,
    WEBSOCKET_ERROR_PREFIX,
    urlRecord.protocol
  )

  // Forbid fragments (hashes) in the WebSocket URL.
  invariant(
    urlRecord.hash === '',
    `%s: The URL contains a fragment identifier ('%s'). Fragment identifiers are not allowed in WebSocket URLs.`,
    WEBSOCKET_ERROR_PREFIX,
    urlRecord.hash
  )

  return urlRecord
}
