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
import crypto from 'node:crypto';
import { DeferredPromise } from '@open-draft/deferred-promise';
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
it('returns false from "write()" once the buffer exceeds the high water mark', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.resume();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect(socket.write(Buffer.alloc(4 * 1024 * 1024))).toBe(false);
        await expect.poll(() => listeners.drain).toHaveBeenCalledOnce();
        // Once drained, small writes fit into the buffer again.
        expect(socket.write('hello')).toBe(true);
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
it('returns false from the mock server "write()" once the buffer exceeds the high water mark', async () => {
    const serverSocketPromise = new DeferredPromise();
    interceptor.on('connection', ({ socket, controller }) => {
        controller.claim();
        serverSocketPromise.resolve(socket);
    });
    const socket = net.connect(1337, '127.0.0.1');
    const { listeners } = spyOnSocket(socket);
    // Pause the client so it does not read the mocked data.
    socket.pause();
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    const serverSocket = await serverSocketPromise;
    const drainListener = vi.fn();
    serverSocket.on('drain', drainListener);
    // Writing to a client that does not read must report backpressure.
    expect(serverSocket.write(Buffer.alloc(4 * 1024 * 1024))).toBe(false);
    expect(drainListener).not.toHaveBeenCalled();
    // Once the client resumes reading, the buffered writes flush
    // and the mock server socket must emit the "drain" event.
    socket.resume();
    await expect.poll(() => drainListener).toHaveBeenCalledOnce();
    // Once drained, small writes fit into the buffer again.
    expect(serverSocket.write('hello')).toBe(true);
    socket.destroy();
});
it('delivers a large mocked response intact across "pause()" and "resume()"', async () => {
    const expectedResponse = crypto.randomBytes(4 * 1024 * 1024);
    interceptor.on('connection', ({ socket, controller }) => {
        controller.claim();
        socket.write(expectedResponse);
        socket.end();
    });
    const socket = net.connect(1337, '127.0.0.1');
    const { listeners } = spyOnSocket(socket);
    const receivedChunks = [];
    socket.on('data', (chunk) => {
        receivedChunks.push(chunk);
        // Pause reading on the first received chunk,
        // then resume shortly after.
        if (receivedChunks.length === 1) {
            socket.pause();
            setTimeout(() => {
                socket.resume();
            }, 100);
        }
    });
    await expect
        .poll(() => listeners.end, { timeout: 4000 })
        .toHaveBeenCalledOnce();
    const receivedResponse = Buffer.concat(receivedChunks);
    expect.soft(receivedResponse.byteLength).toBe(expectedResponse.byteLength);
    expect(receivedResponse.equals(expectedResponse)).toBe(true);
});
it('delivers a large response intact across "pause()" and "resume()"', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const expectedResponse = crypto.randomBytes(4 * 1024 * 1024);
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end(expectedResponse);
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
            // Pause reading on the first received chunk,
            // then resume shortly after.
            if (receivedChunks.length === 1) {
                socket.pause();
                setTimeout(() => {
                    socket.resume();
                }, 100);
            }
        });
        await expect.poll(() => listeners.end, { timeout: 4000 }).toHaveBeenCalledOnce();
        const receivedResponse = Buffer.concat(receivedChunks);
        expect.soft(receivedResponse.byteLength).toBe(expectedResponse.byteLength);
        expect(receivedResponse.equals(expectedResponse)).toBe(true);
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
