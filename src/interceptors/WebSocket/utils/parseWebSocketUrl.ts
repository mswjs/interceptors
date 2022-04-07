import { invariant, format } from 'outvariant'

export const WEBSOCKET_CONSTRUCTOR_ERROR = `Syntax Error: Failed to construct 'WebSocket'`

/**
 * Validate the given WebSocket URL string.
 */
export function parseWebSocketUrl(url?: string | null): URL {
  invariant(url, 'SyntaxError: 1 argument required, but only 0 present.')

  let urlRecord: URL

  try {
    urlRecord = new URL(url)
  } catch (error) {
    throw new Error(
      format(`%s: The URL '%s' is invalid.`, WEBSOCKET_CONSTRUCTOR_ERROR, url)
    )
  }

  // URL must have a protocol specified.
  invariant(
    urlRecord.protocol !== '',
    `%s: The URL '%s' is invalid.`,
    WEBSOCKET_CONSTRUCTOR_ERROR,
    urlRecord.toString()
  )

  // Forbid invalid WebSocket protocols.
  invariant(
    urlRecord.protocol === 'wss:' || urlRecord.protocol === 'ws:',
    `%s: The URL's scheme must be either 'ws' or 'wss'. '%s' is not allowed.`,
    WEBSOCKET_CONSTRUCTOR_ERROR,
    urlRecord.protocol.replace(':', '')
  )

  // Forbid fragments (hashes) in the WebSocket URL.
  invariant(
    urlRecord.hash === '',
    `%s: The URL contains a fragment identifier ('%s'). Fragment identifiers are not allowed in WebSocket URLs.`,
    WEBSOCKET_CONSTRUCTOR_ERROR,
    urlRecord.hash.replace('#', '')
  )

  return urlRecord
}
