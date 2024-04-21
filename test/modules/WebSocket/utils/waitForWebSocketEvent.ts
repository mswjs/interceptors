import { DeferredPromise } from '@open-draft/deferred-promise'

/**
 * Returns a Promise that resolves when the given WebSocket
 * instance emits the said event.
 */
export function waitForWebSocketEvent<Type extends keyof WebSocketEventMap>(
  type: Type,
  ws: WebSocket
) {
  const eventPromise = new DeferredPromise<void>()
  ws.addEventListener(type, () => eventPromise.resolve(), { once: true })
  return eventPromise
}
