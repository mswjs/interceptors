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
function createUnrefedServer() {
    return new net.Server((socket) => {
        // Unref the server-side sockets so only the client-side
        // handles are reflected in the active resources count.
        socket.unref();
    });
}
it('returns the socket from "ref()" and "unref()"', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(createUnrefedServer), true);
        const socket = net.connect(server.port, server.hostname);
        expect.soft(socket.unref()).toBe(socket);
        expect(socket.ref()).toBe(socket);
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
it('does not hold the process once "unref()" is called', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(createUnrefedServer)
        // Wait for the sockets from the previous tests to fully close.
        , true);
        // Wait for the sockets from the previous tests to fully close.
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        socket.unref();
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
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
it('holds the process again after "ref()"', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(createUnrefedServer)
        // Wait for the sockets from the previous tests to fully close.
        , true);
        // Wait for the sockets from the previous tests to fully close.
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        socket.unref();
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
        socket.ref();
        await expect.poll(() => countActiveTcpSockets()).toBeGreaterThan(0);
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
it('stays unrefed when "unref()" is called while connecting', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(createUnrefedServer)
        // Wait for the sockets from the previous tests to fully close.
        , true);
        // Wait for the sockets from the previous tests to fully close.
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        socket.unref();
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        await expect.poll(() => countActiveTcpSockets()).toBe(0);
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
