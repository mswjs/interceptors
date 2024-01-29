import type { WebSocketServer } from 'ws'

export function getWsUrl(ws: WebSocketServer): string {
  const address = ws.address()
  if (typeof address === 'string') {
    return address
  }
  return `ws://${address.address}:${address.port}`
}
