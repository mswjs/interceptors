import https from 'node:https';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { HttpServer } from '@open-draft/test-server/http';
import { HttpRequestInterceptor } from '#/src/interceptors/http';
import { toWebResponse } from '#/test/helpers';
const httpServer = new HttpServer((app) => {
    app.get('/', (req, res) => {
        res.send('original');
    });
});
const interceptor = new HttpRequestInterceptor();
beforeAll(async () => {
    interceptor.apply();
    await httpServer.listen();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(async () => {
    interceptor.dispose();
    await httpServer.close();
});
it('exposes socket address information for a mocked HTTPS request', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('mocked response'));
    });
    const request = https.get('https://example.com');
    const addressOnConnectPromise = new DeferredPromise();
    const addressOnSecureConnectPromise = new DeferredPromise();
    request.on('socket', (socket) => {
        socket.on('connect', () => {
            addressOnConnectPromise.resolve(socket.address());
        });
        socket.on('secureConnect', () => {
            addressOnSecureConnectPromise.resolve(socket.address());
        });
    });
    await toWebResponse(request);
    await expect(addressOnConnectPromise).resolves.toEqual({
        address: '127.0.0.1',
        family: 'IPv4',
        port: expect.any(Number),
    });
    await expect(addressOnSecureConnectPromise).resolves.toEqual({
        address: '127.0.0.1',
        family: 'IPv4',
        port: expect.any(Number),
    });
    const socket = request.socket;
    expect.soft(socket.remoteAddress).toBe('127.0.0.1');
    expect.soft(socket.remotePort).toBe(443);
    expect.soft(socket.remoteFamily).toBe('IPv4');
    expect.soft(socket.localAddress).toBe('127.0.0.1');
    expect.soft(socket.localPort).toEqual(expect.any(Number));
});
it('exposes socket address information for a bypassed HTTPS request', async () => {
    const request = https.get(httpServer.https.url('/'), {
        rejectUnauthorized: false,
    });
    const addressOnSecureConnectPromise = new DeferredPromise();
    request.on('socket', (socket) => {
        socket.on('secureConnect', () => {
            addressOnSecureConnectPromise.resolve(socket.address());
        });
    });
    await toWebResponse(request);
    await expect(addressOnSecureConnectPromise).resolves.toEqual({
        address: '127.0.0.1',
        family: 'IPv4',
        port: expect.any(Number),
    });
});
