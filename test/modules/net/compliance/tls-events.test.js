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
it('emits the "lookup" event when connecting to a hostname', async () => {
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
            host: 'localhost',
            family: 4,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
        });
        const lookupListener = vi.fn();
        socket.on('lookup', lookupListener);
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        expect(lookupListener).toHaveBeenCalledExactlyOnceWith(null, '127.0.0.1', 4, 'localhost');
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
it('emits "secureConnect" exactly once', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
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
        await expect.poll(() => secureConnectListener).toHaveBeenCalled();
        await new Promise((resolve) => {
            setTimeout(resolve, 200);
        });
        expect(secureConnectListener).toHaveBeenCalledOnce();
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
it('emits the "session" event for a bypassed connection', async () => {
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
        const events = [];
        const socketStatesOnSession = [];
        socket.on('secureConnect', () => {
            events.push('secureConnect');
        });
        const sessionListener = vi.fn(() => {
            events.push('session');
            socketStatesOnSession.push({
                pending: socket.pending,
                connecting: socket.connecting,
                authorized: socket.authorized,
                readyState: socket.readyState,
                destroyed: socket.destroyed,
            });
        });
        socket.on('session', sessionListener);
        // A Node.js TLS server issues two TLS 1.3 session tickets by default,
        // each emitting a separate "session" event on the client.
        await expect.poll(() => sessionListener.mock.calls.length).toBe(2);
        await new Promise((resolve) => {
            setTimeout(resolve, 200);
        });
        expect.soft(sessionListener).toHaveBeenCalledTimes(2);
        // In TLS 1.3, session tickets arrive only after the handshake is done.
        expect.soft(events).toEqual(['secureConnect', 'session', 'session']);
        for (const [sessionData] of sessionListener.mock.calls) {
            expect.soft(sessionData).toBeInstanceOf(Buffer);
            expect.soft(sessionData.byteLength).toBeGreaterThan(0);
        }
        expect(socketStatesOnSession).toEqual([
            {
                pending: false,
                connecting: false,
                authorized: true,
                readyState: 'open',
                destroyed: false,
            },
            {
                pending: false,
                connecting: false,
                authorized: true,
                readyState: 'open',
                destroyed: false,
            },
        ]);
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
it('emits the "session" event for a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = tls.connect(443, 'any.host.com');
    const events = [];
    const socketStatesOnSession = [];
    socket.on('secureConnect', () => {
        events.push('secureConnect');
    });
    const sessionListener = vi.fn(() => {
        events.push('session');
        socketStatesOnSession.push({
            pending: socket.pending,
            connecting: socket.connecting,
            authorized: socket.authorized,
            readyState: socket.readyState,
            destroyed: socket.destroyed,
        });
    });
    socket.on('session', sessionListener);
    // A Node.js TLS server issues two TLS 1.3 session tickets by default,
    // each emitting a separate "session" event on the client.
    await expect.poll(() => sessionListener.mock.calls.length).toBe(2);
    await new Promise((resolve) => {
        setTimeout(resolve, 200);
    });
    expect.soft(sessionListener).toHaveBeenCalledTimes(2);
    // In TLS 1.3, session tickets arrive only after the handshake is done.
    expect.soft(events).toEqual(['secureConnect', 'session', 'session']);
    for (const [sessionData] of sessionListener.mock.calls) {
        expect.soft(sessionData).toBeInstanceOf(Buffer);
        expect.soft(sessionData.byteLength).toBeGreaterThan(0);
    }
    expect(socketStatesOnSession).toEqual([
        {
            pending: false,
            connecting: false,
            // Mocked connections are never authorized (no real peer certificate).
            authorized: false,
            readyState: 'open',
            destroyed: false,
        },
        {
            pending: false,
            connecting: false,
            authorized: false,
            readyState: 'open',
            destroyed: false,
        },
    ]);
    socket.destroy();
});
it('emits the "keylog" events for a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = tls.connect(443, 'any.host.com');
    const events = [];
    socket.on('secureConnect', () => {
        events.push('secureConnect');
    });
    const keylogListener = vi.fn(() => {
        events.push('keylog');
    });
    socket.on('keylog', keylogListener);
    await expect.poll(() => events.includes('secureConnect')).toBe(true);
    // A TLS 1.3 handshake derives five secrets, each reported
    // via a separate "keylog" event before the handshake completes.
    expect.soft(keylogListener).toHaveBeenCalledTimes(5);
    expect.soft(events).toEqual([
        'keylog',
        'keylog',
        'keylog',
        'keylog',
        'keylog',
        'secureConnect',
    ]);
    for (const [line] of keylogListener.mock.calls) {
        expect.soft(line).toBeInstanceOf(Buffer);
    }
    const keylogLabels = keylogListener.mock.calls.map(([line]) => {
        return line.toString().split(' ')[0];
    });
    expect(keylogLabels).toEqual([
        'SERVER_HANDSHAKE_TRAFFIC_SECRET',
        'EXPORTER_SECRET',
        'SERVER_TRAFFIC_SECRET_0',
        'CLIENT_HANDSHAKE_TRAFFIC_SECRET',
        'CLIENT_TRAFFIC_SECRET_0',
    ]);
    socket.destroy();
});
it('emits the "keylog" event', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
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
        const keylogListener = vi.fn();
        socket.on('keylog', keylogListener);
        await expect.poll(() => keylogListener).toHaveBeenCalled();
        expect(keylogListener).toHaveBeenCalledWith(expect.any(Buffer));
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
it('emits the "OCSPResponse" event', async () => {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_5, await createTestServer(() => {
            const tlsServer = new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
            });
            tlsServer.on('OCSPRequest', (certificate, issuer, callback) => {
                callback(null, Buffer.from('mock-ocsp-response'));
            });
            return tlsServer;
        }), true);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
            requestOCSP: true,
        });
        const ocspResponseListener = vi.fn();
        socket.on('OCSPResponse', ocspResponseListener);
        await expect.poll(() => ocspResponseListener).toHaveBeenCalledOnce();
        expect(ocspResponseListener).toHaveBeenCalledWith(Buffer.from('mock-ocsp-response'));
        socket.destroy();
    }
    catch (e_5) {
        env_5.error = e_5;
        env_5.hasError = true;
    }
    finally {
        const result_5 = __disposeResources(env_5);
        if (result_5)
            await result_5;
    }
});
