import { DeferredPromise } from '@open-draft/deferred-promise';
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';
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
it('forwards incoming server data from the original server', async () => {
    interceptor.once('connection', ({ server }) => {
        server.connect();
    });
    const url = server.ws.url('/?greet');
    const ws = new WebSocket(url);
    const messageReceivedPromise = new DeferredPromise();
    ws.addEventListener('message', (event) => {
        messageReceivedPromise.resolve(event);
    });
    const messageEvent = await messageReceivedPromise;
    expect(messageEvent.type).toBe('message');
    expect(messageEvent.data).toBe('hello world');
    expect(messageEvent.origin).toBe(url.origin);
    expect(messageEvent.target).toEqual(ws);
    ws.close();
});
it('forwards outgoing client data to the original server', async () => {
    interceptor.once('connection', ({ client, server }) => {
        server.connect();
        client.addEventListener('message', (event) => server.send(event.data));
    });
    const url = server.ws.url('/?echo');
    const ws = new WebSocket(url);
    const messageReceivedPromise = new DeferredPromise();
    ws.addEventListener('open', () => {
        ws.send('John');
    });
    ws.addEventListener('message', (event) => {
        messageReceivedPromise.resolve(event);
    });
    const messageEvent = await messageReceivedPromise;
    expect(messageEvent.type).toBe('message');
    expect(messageEvent.data).toBe('John');
    expect(messageEvent.origin).toBe(url.origin);
    expect(messageEvent.target).toEqual(ws);
    ws.close();
});
it('closes the actual server connection when the client closes', async () => {
    const clientClosePromise = new DeferredPromise();
    const serverSocketPromise = new DeferredPromise();
    interceptor.once('connection', ({ client, server }) => {
        server.connect();
        serverSocketPromise.resolve(server.socket);
        client.addEventListener('message', (event) => {
            if (event.data === 'close') {
                event.preventDefault();
                return client.close();
            }
        });
    });
    const ws = new WebSocket(server.ws.url());
    ws.addEventListener('open', () => {
        ws.send('close');
    });
    ws.addEventListener('close', (event) => clientClosePromise.resolve(event));
    await clientClosePromise;
    const serverSocket = await serverSocketPromise;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
    expect(serverSocket.readyState).toBe(WebSocket.CLOSING);
});
it('throw an error when connecting to a non-existing server', async () => {
    interceptor.once('connection', ({ server }) => {
        server.connect();
    });
    const errorListener = vi.fn();
    const ws = new WebSocket('ws://localhost:9876');
    ws.onerror = errorListener;
    await vi.waitFor(() => {
        expect(errorListener).toHaveBeenCalledTimes(1);
    });
});
it('inherits the "binaryType" from the mock WebSocket', async () => {
    const clientMessageListener = vi.fn();
    const interceptorMessageListener = vi.fn();
    interceptor.once('connection', ({ server }) => {
        server.connect();
        server.addEventListener('message', (event) => {
            interceptorMessageListener(event.data);
        });
    });
    const ws = new WebSocket(server.ws.url('/?greet-binary'));
    // Set a custom binary type for this socket instance.
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event) => clientMessageListener(event.data);
    await vi.waitFor(() => {
        const interceptorData = interceptorMessageListener.mock.calls[0][0];
        expect(new TextDecoder().decode(interceptorData)).toBe('hello');
        const clientData = clientMessageListener.mock.calls[0][0];
        expect(new TextDecoder().decode(clientData)).toBe('hello');
    });
    ws.close();
});
