/**
 * This test suite asserts that the intercepted WebSocket client
 * still dispatches the correct events in mocked/bypassed scenarios.
 */
import { inject } from 'vitest';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';
import { setTimeout } from '#/test/setup/helpers-neutral';
import { getTestServer } from '#/test/setup/vitest';
const nodeMajorVersion = inject('nodeMajorVersion');
const testServer = getTestServer();
const interceptor = new WebSocketInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    vi.restoreAllMocks();
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('emits "open" event when mocked connection is opened', async () => {
    /**
     * @note At least one "connection" listener has to be added
     * in order for the WebSocket connections to be mock-first.
     */
    interceptor.once('connection', () => { });
    const ws = new WebSocket('wss://localhost');
    const openListener = vi.fn();
    ws.onopen = openListener;
    await expect.poll(() => openListener).toHaveBeenCalledTimes(1);
    const [openEvent] = openListener.mock.calls[0];
    expect(openEvent.type).toBe('open');
    expect(openEvent.target).toBe(ws);
    expect(openEvent.currentTarget).toBe(ws);
});
it('emits "open" event when original connection is opened', async () => {
    const ws = new WebSocket(testServer.ws.url());
    const openListener = vi.fn();
    ws.onopen = openListener;
    await expect.poll(() => openListener).toHaveBeenCalledTimes(1);
    const [openEvent] = openListener.mock.calls[0];
    expect(openEvent.type).toBe('open');
    expect(openEvent.target).toBe(ws);
    expect(openEvent.currentTarget).toBe(ws);
});
it('emits "message" event on incoming mock server data', async () => {
    interceptor.once('connection', ({ client }) => {
        client.send('hello');
    });
    const ws = new WebSocket('wss://localhost');
    const messageListener = vi.fn();
    ws.onmessage = messageListener;
    await expect.poll(() => messageListener).toHaveBeenCalledTimes(1);
    const [messageEvent] = messageListener.mock.calls[0];
    expect(messageEvent.type).toBe('message');
    expect(messageEvent.data).toBe('hello');
    expect(messageEvent.target).toBe(ws);
    expect(messageEvent.currentTarget).toBe(ws);
    expect(messageEvent.origin).toBe(ws.url);
});
it('emits "message" event on incoming original server data', async () => {
    // The actual server greets every connected client.
    const url = testServer.ws.url('/?greet');
    const ws = new WebSocket(url);
    const messageListener = vi.fn();
    ws.onmessage = messageListener;
    await expect.poll(() => messageListener).toHaveBeenCalledTimes(1);
    const [messageEvent] = messageListener.mock.calls[0];
    expect(messageEvent.type).toBe('message');
    expect(messageEvent.data).toBe('hello world');
    expect(messageEvent.target).toBe(ws);
    expect(messageEvent.currentTarget).toBe(ws);
    expect(messageEvent.origin).toBe(url.origin);
});
it('emits "close" event when the mocked client closes the connection', async () => {
    interceptor.once('connection', () => { });
    const ws = new WebSocket('wss://localhost');
    const closeListener = vi.fn();
    ws.onclose = closeListener;
    /**
     * @note Closing the connection before it has been open
     * results in an error.
     */
    ws.onopen = () => ws.close();
    await expect.poll(() => closeListener).toHaveBeenCalledTimes(1);
    const [closeEvent] = closeListener.mock.calls[0];
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(1000);
    expect(closeEvent.reason).toBe('');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
});
it('emits "close" event when the original server closes the connection', async () => {
    // The actual server closes every connection with the given code.
    const ws = new WebSocket(testServer.ws.url('/?close=1000'));
    const closeListener = vi.fn();
    ws.onclose = closeListener;
    await expect.poll(() => closeListener).toHaveBeenCalledTimes(1);
    const [closeEvent] = closeListener.mock.calls[0];
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(1000);
    expect(closeEvent.reason).toBe('');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
});
it('emits "close" event when the interceptor gracefully closes the connection', async () => {
    interceptor.once('connection', ({ client }) => {
        queueMicrotask(() => client.close());
    });
    const ws = new WebSocket('wss://localhost');
    const closeListener = vi.fn();
    ws.onclose = closeListener;
    await expect.poll(() => closeListener).toHaveBeenCalledTimes(1);
    const [closeEvent] = closeListener.mock.calls[0];
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(1000);
    expect(closeEvent.reason).toBe('');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
});
it('emits "close" event when the interceptor closes the connection with error code', async () => {
    interceptor.once('connection', ({ client }) => {
        client.close(3000, 'Oops!');
    });
    const closeEventPromise = new DeferredPromise();
    const ws = new WebSocket('wss://localhost');
    ws.onclose = closeEventPromise.resolve;
    const closeEvent = await closeEventPromise;
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(3000);
    expect(closeEvent.reason).toBe('Oops!');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
});
it('emits "close" event when the original server closes the connection with error code', async () => {
    // The actual server closes every connection with the given code.
    const ws = new WebSocket(testServer.ws.url('/?close=1003,Server reason'));
    const closeListener = vi.fn();
    ws.onclose = closeListener;
    await expect.poll(() => closeListener).toHaveBeenCalledTimes(1);
    const [closeEvent] = closeListener.mock.calls[0];
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(1003);
    expect(closeEvent.reason).toBe('Server reason');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
});
it('emits "error" event on passthrough client connection failure', async () => {
    // Connecting to a non-existing server URL without any
    // interceptor listener MUST establish the connection as-is
    // (no "open" event; "error" event; no "close" event).
    const ws = new WebSocket('wss://localhost/non-existing-url');
    const openListener = vi.fn();
    const errorListener = vi.fn();
    const closeListener = vi.fn();
    ws.onopen = openListener;
    ws.onerror = errorListener;
    ws.onclose = closeListener;
    await expect.poll(() => errorListener).toHaveBeenCalledTimes(1);
    expect(openListener).not.toHaveBeenCalled();
    /**
     * @note Node.js below v24 bundles Undici 6, which fails the
     * connection without dispatching the "close" event or transitioning
     * the socket to the CLOSED state. Node.js v24+ (Undici 7) follows
     * the specification: failing the connection closes the socket and
     * dispatches both "error" and "close".
     */
    if (nodeMajorVersion >= 24) {
        expect(ws.readyState).toBe(ws.CLOSED);
        expect(closeListener).toHaveBeenCalledOnce();
    }
});
it('allows erroring the connection in a synchronous listener', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    interceptor.once('connection', () => {
        throw new Error('mock error');
    });
    const ws = new WebSocket('wss://localhost/non-existing-url');
    const openListener = vi.fn();
    const errorListener = vi.fn();
    const closeListener = vi.fn();
    ws.onopen = openListener;
    ws.onerror = errorListener;
    ws.onclose = closeListener;
    await expect.poll(() => errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
    }));
    await expect.poll(() => ws.readyState).toBe(ws.CLOSED);
    expect(openListener).not.toHaveBeenCalled();
    expect(closeListener).toHaveBeenCalledOnce();
    expect(closeListener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'close',
        code: 1011,
        reason: 'mock error',
    }));
});
it('allows erroring the connection from an asynchronous listener', async ({ onTestFinished, }) => {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    interceptor.once('connection', async () => {
        await setTimeout(200);
        throw new Error('mock error');
    });
    const ws = new WebSocket('wss://localhost/non-existing-url');
    const openListener = vi.fn();
    const errorListener = vi.fn();
    const closeListener = vi.fn();
    ws.onopen = openListener;
    ws.onerror = errorListener;
    ws.onclose = closeListener;
    await expect.poll(() => errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
    }));
    await expect.poll(() => ws.readyState).toBe(ws.CLOSED);
    expect(openListener).not.toHaveBeenCalled();
    expect(closeListener).toHaveBeenCalledOnce();
    expect(closeListener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'close',
        code: 1011,
        reason: 'mock error',
    }));
});
it('does not emit "error" event on mocked error code closures', async () => {
    interceptor.once('connection', ({ client }) => {
        /**
         * @note Closing the connection with non-configurable code
         * does NOT result in the "error" event.
         */
        client.close(1003);
    });
    const ws = new WebSocket('wss://localhost');
    const errorListener = vi.fn();
    const closeListener = vi.fn();
    ws.onerror = errorListener;
    ws.onclose = closeListener;
    await expect.poll(() => closeListener).toHaveBeenCalledTimes(1);
    const [closeEvent] = closeListener.mock.calls[0];
    expect(closeEvent.type).toBe('close');
    expect(closeEvent.code).toBe(1003);
    expect(closeEvent.reason).toBe('');
    expect(closeEvent.wasClean).toBe(true);
    expect(closeEvent.target).toBe(ws);
    expect(closeEvent.currentTarget).toBe(ws);
    expect(errorListener).not.toHaveBeenCalled();
});
