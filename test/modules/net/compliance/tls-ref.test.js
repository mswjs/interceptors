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
/**
 * Count the TCP socket handles that keep the process alive.
 * Unrefed handles are excluded from the active resources list,
 * making this a proxy for the process exit behavior.
 */
function countActiveTcpSockets() {
    return process.getActiveResourcesInfo().filter((resourceName) => {
        return resourceName === 'TCPSocketWrap';
    }).length;
}
it('releases all connection handles once a TLS socket is destroyed', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            const tlsServer = new tls.Server({
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
            });
            // Unref the server-side sockets so only the client-side
            // handles are reflected in the active resources count.
            tlsServer.on('connection', (socket) => {
                socket.unref();
            });
            return tlsServer;
        })
        // Wait for the sockets from the previous tests to fully close.
        , true);
        // Wait for the sockets from the previous tests to fully close.
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
        const socket = tls.connect({
            port: server.port,
            host: server.hostname,
            servername: 'localhost',
            ca: [TLS_CERTIFICATE],
        });
        const secureConnectListener = vi.fn();
        socket.on('secureConnect', secureConnectListener);
        await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce();
        socket.destroy();
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
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
