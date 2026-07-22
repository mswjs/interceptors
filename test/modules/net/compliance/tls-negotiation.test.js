var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
// @vitest-environment node
import tls from 'node:tls';
import { SocketInterceptor } from '#/src/interceptors/net';
import { createTestServer } from '#/test/helpers';
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from './fixtures/tls';
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
it('negotiates the TLS protocol and cipher', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
            });
        }), true);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
        });
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        expect.soft(socket.getProtocol()).toBe('TLSv1.3');
        expect(socket.getCipher()).toEqual({
            name: 'TLS_AES_256_GCM_SHA384',
            standardName: 'TLS_AES_256_GCM_SHA384',
            version: 'TLSv1.3',
        });
        socket.destroy();
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
});
it('negotiates the ALPN protocol', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
                ALPNProtocols: ['h2', 'http/1.1'],
            });
        }), true);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
            ALPNProtocols: ['http/1.1'],
        });
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        expect(socket.alpnProtocol).toBe('http/1.1');
        socket.destroy();
    }
    catch (e_2) {
        env_2.error = e_2;
        env_2.hasError = true;
    }
    finally {
        const result_2 = __disposeResources(env_2);
        if (result_2)
            await result_2;
    }
});
it('reports no ALPN protocol if none was requested', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
            });
        }), true);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
        });
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        expect(socket.alpnProtocol).toBe(false);
        socket.destroy();
    }
    catch (e_3) {
        env_3.error = e_3;
        env_3.hasError = true;
    }
    finally {
        const result_3 = __disposeResources(env_3);
        if (result_3)
            await result_3;
    }
});
it('sends the SNI servername to the server', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const serverSecureConnectionListener = vi.fn();
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            const tlsServer = new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
            });
            tlsServer.on('secureConnection', (serverSocket) => {
                serverSecureConnectionListener(serverSocket.servername);
            });
            return tlsServer;
        }), true);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
        });
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        await expect.poll(() => serverSecureConnectionListener).toHaveBeenCalled();
        // The server must observe exactly one connection with the
        // servername requested by the client.
        expect.soft(serverSecureConnectionListener).toHaveBeenCalledOnce();
        expect(serverSecureConnectionListener).toHaveBeenCalledWith('localhost');
        socket.destroy();
    }
    catch (e_4) {
        env_4.error = e_4;
        env_4.hasError = true;
    }
    finally {
        const result_4 = __disposeResources(env_4);
        if (result_4)
            await result_4;
    }
});
