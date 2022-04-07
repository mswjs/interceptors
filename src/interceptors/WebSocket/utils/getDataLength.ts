import type { WebSocketMessageData } from '../WebSocketOverride'

/**
 * Return the length of a data chunk sent via WebSocket.
 */
export function getDataLength(data: WebSocketMessageData): number {
  if (typeof data === 'string') {
    return data.length
  }

  if (data instanceof Blob) {
    return data.size
  }

  return data.byteLength
}
