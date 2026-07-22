import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';
import { setTimeout } from '#/test/setup/helpers-neutral';
import { getTestServer } from '#/test/setup/vitest';
const server = getTestServer();
const interceptor = new WebSocketInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('emits the correct "connection" event on the interceptor', async () => {
    const connectionListener = vi.fn();
    interceptor.once('connection', connectionListener);
    new WebSocket('wss://example.com');
    // Must not emit the "connection" event on this tick.
    expect(connectionListener).toHaveBeenCalledTimes(0);
    await setTimeout(0);
    // Must emit the "connection" event on the next tick
    // so the client can modify the WebSocket instance meanwhile.
    expect(connectionListener).toHaveBeenCalledTimes(1);
    expect(connectionListener).toHaveBeenNthCalledWith(1, expect.objectContaining({
        client: expect.objectContaining({
            id: expect.stringMatching(/^\w{9,}$/),
            send: expect.any(Function),
            addEventListener: expect.any(Function),
            removeEventListener: expect.any(Function),
            close: expect.any(Function),
        }),
        server: expect.objectContaining({
            send: expect.any(Function),
            addEventListener: expect.any(Function),
            removeEventListener: expect.any(Function),
        }),
        info: {
            protocols: undefined,
        },
    }));
});
it('does not connect to the actual WebSocket server by default', async () => {
    const connectionListener = vi.fn();
    interceptor.once('connection', connectionListener);
    // Connect to the actual server that greets every connected client.
    const messageListener = vi.fn();
    const ws = new WebSocket(server.ws.url('/?greet'));
    ws.onmessage = messageListener;
    await setTimeout(250);
    expect(connectionListener).toHaveBeenCalledTimes(1);
    // Must not receive the greeting since the connection
    // to the actual server was never established.
    expect(messageListener).not.toHaveBeenCalled();
});
it('includes connection information in the "connection" event payload', async () => {
    const connectionListener = vi.fn();
    interceptor.once('connection', connectionListener);
    new WebSocket('wss://example.com', ['protocol1', 'protocol2']);
    await setTimeout(0);
    expect(connectionListener).toHaveBeenCalledTimes(1);
    expect(connectionListener).toHaveBeenNthCalledWith(1, expect.objectContaining({
        info: {
            // Preserves the client protocols as-is.
            protocols: ['protocol1', 'protocol2'],
        },
    }));
});
