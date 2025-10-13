import { invariant } from 'outvariant'
import type { WebSocketServer } from 'ws'

export function getWsUrl(ws: WebSocketServer): string {
  const address = ws.address()

  invariant(address != null, 'Failed to get WebSocket address: address is null')

  if (typeof address === 'string') {
    return address
  }
  return `ws://${address.address}:${address.port}`
}
