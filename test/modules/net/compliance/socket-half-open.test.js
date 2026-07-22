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
import net from 'node:net';
import { SocketInterceptor } from '#/src/interceptors/net';
import { createTestServer, spyOnSocket } from '#/test/helpers';
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
it('delivers writes issued after the server ends a half-open connection', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const serverReceivedChunks = [];
        const serverEndListener = vi.fn();
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server({ allowHalfOpen: true }, (socket) => {
                socket.on('data', (chunk) => {
                    serverReceivedChunks.push(chunk);
                });
                socket.on('end', () => {
                    serverEndListener();
                    socket.end();
                });
                // End the server-to-client direction immediately.
                socket.end();
            });
        }), true);
        const socket = net.connect({
            port: server.port,
            host: server.hostname,
            allowHalfOpen: true,
        });
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.end).toHaveBeenCalledOnce();
        // The client can still write after receiving FIN from the server.
        socket.write('after-fin');
        socket.end('final');
        await expect.poll(() => serverEndListener).toHaveBeenCalledOnce();
        expect(Buffer.concat(serverReceivedChunks).toString()).toBe('after-finfinal');
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
it('closes the connection once the half-open client ends', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server({ allowHalfOpen: true }, (socket) => {
                socket.resume();
                socket.on('end', () => {
                    socket.end();
                });
                socket.end();
            });
        }), true);
        const socket = net.connect({
            port: server.port,
            host: server.hostname,
            allowHalfOpen: true,
        });
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.end).toHaveBeenCalledOnce();
        socket.end();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(listeners.close).toHaveBeenCalledWith(false);
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
it('ends the socket automatically without "allowHalfOpen"', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const serverEndListener = vi.fn();
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.resume();
                socket.on('end', serverEndListener);
                socket.end();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        // Without "allowHalfOpen", the client automatically sends FIN
        // back once the server ends the connection.
        await expect.poll(() => serverEndListener).toHaveBeenCalledOnce();
        expect(listeners.close).toHaveBeenCalledWith(false);
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
