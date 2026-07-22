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
import { setTimeout } from 'node:timers/promises';
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
it('intercepts buffered writes for passthrough socket', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const serverDataListener = vi.fn();
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', serverDataListener);
            });
        }), true);
        const interceptorDataListener = vi.fn();
        interceptor.on('connection', ({ socket, controller }) => {
            controller.passthrough();
            socket.on('data', interceptorDataListener);
        });
        const socket = net.connect(server.port, server.hostname);
        // Writing multiple chunks before socket connects buffers them into a single write.
        socket.write('hello ');
        socket.write('from ');
        socket.end('client');
        await expect
            .poll(() => serverDataListener)
            .toHaveBeenCalledExactlyOnceWith(Buffer.from('hello from client'));
        // Interceptor "data" events aren't buffered since the connection is pending.
        expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3);
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(1, Buffer.from('hello '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(2, Buffer.from('from '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(3, Buffer.from('client'));
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
it('intercepts separate writes for passthrough socket', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const serverDataListener = vi.fn();
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', serverDataListener);
            });
        }), true);
        const interceptorDataListener = vi.fn();
        interceptor.on('connection', async ({ socket, controller }) => {
            socket.on('data', interceptorDataListener);
            setTimeout(30);
            controller.passthrough();
        });
        const socket = net.connect(server.port, server.hostname);
        socket.write('hello ');
        await setTimeout(20);
        socket.write('from ');
        await setTimeout(20);
        socket.end('client');
        await expect.poll(() => serverDataListener).toHaveBeenCalledTimes(3);
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(1, Buffer.from('hello '));
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(2, Buffer.from('from '));
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(3, Buffer.from('client'));
        expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3);
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(1, Buffer.from('hello '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(2, Buffer.from('from '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(3, Buffer.from('client'));
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
it('does not duplicate writes while the socket is pending', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const serverDataListener = vi.fn();
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', serverDataListener);
            });
        }), true);
        const interceptorDataListener = vi.fn();
        interceptor.on('connection', async ({ socket, controller }) => {
            socket.on('data', interceptorDataListener);
            socket.on('data', (chunk) => {
                if (chunk.toString() === 'hello ') {
                    controller.passthrough();
                }
            });
        });
        const socket = net.connect(server.port, server.hostname);
        socket.write('hello ');
        await setTimeout(20);
        socket.write('from ');
        await setTimeout(20);
        socket.end('client');
        await expect.poll(() => serverDataListener).toHaveBeenCalledTimes(3);
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(1, Buffer.from('hello '));
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(2, Buffer.from('from '));
        expect
            .soft(serverDataListener)
            .toHaveBeenNthCalledWith(3, Buffer.from('client'));
        expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3);
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(1, Buffer.from('hello '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(2, Buffer.from('from '));
        expect
            .soft(interceptorDataListener)
            .toHaveBeenNthCalledWith(3, Buffer.from('client'));
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
it('invokes the write callbacks for a passthrough socket', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', (data) => {
                    if (data.toString() === 'two') {
                        socket.end();
                    }
                });
            });
        }), true);
        interceptor.on('connection', ({ controller }) => {
            controller.passthrough();
        });
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        const writeOneCallback = vi.fn();
        const writeTwoCallback = vi.fn();
        const endCallback = vi.fn();
        socket.write('one', writeOneCallback);
        socket.write('two', writeTwoCallback);
        socket.end(endCallback);
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(writeOneCallback).toHaveBeenCalledOnce();
        expect.soft(writeTwoCallback).toHaveBeenCalledOnce();
        expect.soft(endCallback).toHaveBeenCalledOnce();
        expect(writeOneCallback).toHaveBeenCalledBefore(writeTwoCallback);
        expect(writeTwoCallback).toHaveBeenCalledBefore(endCallback);
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
it('invokes callbacks for nested writes for a passthrough socket', async () => {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_5, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', (data) => {
                    if (data.toString() === 'two') {
                        socket.end();
                    }
                });
            });
        }), true);
        interceptor.on('connection', ({ controller }) => {
            controller.passthrough();
        });
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        const writeCallback = vi.fn(() => socket.end());
        socket.write('one', () => {
            socket.write('two', writeCallback);
        });
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(writeCallback).toHaveBeenCalledOnce();
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
