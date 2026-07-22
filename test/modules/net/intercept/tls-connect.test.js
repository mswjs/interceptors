// @vitest-environment node
import tls from 'node:tls';
import { SocketInterceptor } from '#/src/interceptors/net';
const interceptor = new SocketInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('mocks a connection made via "tls.connect()"', async () => {
    interceptor.on('connection', ({ socket, controller }) => {
        controller.claim();
        socket.on('data', (chunk) => {
            if (chunk.toString() === 'hello from client') {
                socket.write('hello from server');
                socket.end();
            }
        });
    });
    const socket = tls.connect(443, 'any.host.com');
    const secureConnectListener = vi.fn();
    const receivedChunks = [];
    socket.on('secureConnect', secureConnectListener);
    socket.on('data', (chunk) => {
        receivedChunks.push(chunk);
    });
    socket.write('hello from client');
    await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
    await expect
        .poll(() => Buffer.concat(receivedChunks).toString())
        .toBe('hello from server');
});
it('reflects the requested ALPN protocol on a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = tls.connect({
        host: 'any.host.com',
        port: 443,
        ALPNProtocols: ['h2', 'http/1.1'],
    });
    const secureConnectListener = vi.fn();
    socket.on('secureConnect', secureConnectListener);
    await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
    // The mocked server accepts the client's preferred protocol.
    expect(socket.alpnProtocol).toBe('h2');
    socket.destroy();
});
it('reports no ALPN protocol on a mocked connection when none was requested', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = tls.connect(443, 'any.host.com');
    const secureConnectListener = vi.fn();
    socket.on('secureConnect', secureConnectListener);
    await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
    expect(socket.alpnProtocol).toBe(false);
    socket.destroy();
});
it('reports the TLS protocol version on a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = tls.connect(443, 'any.host.com');
    const secureConnectListener = vi.fn();
    socket.on('secureConnect', secureConnectListener);
    await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
    // Must match the mocked cipher (TLS 1.3, see "getCipher()").
    expect(socket.getProtocol()).toBe('TLSv1.3');
    socket.destroy();
});
