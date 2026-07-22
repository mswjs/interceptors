import { DeferredPromise } from '@open-draft/deferred-promise';
/**
 * Returns a Promise that resolves when the given WebSocket
 * instance emits the said event.
 */
export function waitForWebSocketEvent(type, ws) {
    const eventPromise = new DeferredPromise();
    ws.addEventListener(type, () => eventPromise.resolve(), { once: true });
    return eventPromise;
}
