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
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
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
async function createUnixSocketServer() {
    const socketPath = path.join(os.tmpdir(), `interceptors-${process.pid}-${Math.random().toString(32).slice(2)}.sock`);
    const server = new net.Server((socket) => {
        socket.end('hello from server');
    });
    await new Promise((resolve, reject) => {
        server.listen(socketPath, () => {
            resolve();
        });
        server.once('error', reject);
    });
    return {
        socketPath,
        async [Symbol.asyncDispose]() {
            await new Promise((resolve) => {
                server.close(() => {
                    resolve();
                });
            });
            fs.rmSync(socketPath, { force: true });
        },
    };
}
it('connects with "connect(port)"', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        })
        // The host defaults to "localhost".
        , true);
        // The host defaults to "localhost".
        const socket = net.connect(server.port);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remotePort).toBe(server.port);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(listeners.connect).toHaveBeenCalledOnce();
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
it('connects with "connect(port, callback)"', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const connectionCallback = vi.fn();
        const socket = net.connect(server.port, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
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
it('connects with "connect(port, host)"', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remotePort).toBe(server.port);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(listeners.connect).toHaveBeenCalledOnce();
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
it('connects with "connect(port, host, callback)"', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const connectionCallback = vi.fn();
        const socket = net.connect(server.port, server.hostname, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
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
it('connects with "connect(options)"', async () => {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_5, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const socket = net.connect({
            port: server.port,
            host: server.hostname,
        });
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remotePort).toBe(server.port);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(listeners.connect).toHaveBeenCalledOnce();
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
it('connects with "connect(options, callback)"', async () => {
    const env_6 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_6, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const connectionCallback = vi.fn();
        const socket = net.connect({
            port: server.port,
            host: server.hostname,
        }, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
    }
    catch (e_6) {
        env_6.error = e_6;
        env_6.hasError = true;
    }
    finally {
        const result_6 = __disposeResources(env_6);
        if (result_6)
            await result_6;
    }
});
it('connects with "connect(path)"', async () => {
    const env_7 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_7, await createUnixSocketServer(), true);
        const socket = net.connect(server.socketPath);
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
        });
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect.soft(Buffer.concat(receivedChunks).toString()).toBe('hello from server');
        // Unix socket connections expose no remote address info.
        expect.soft(socket.remoteAddress).toBeUndefined();
        expect(socket.localAddress).toBeUndefined();
    }
    catch (e_7) {
        env_7.error = e_7;
        env_7.hasError = true;
    }
    finally {
        const result_7 = __disposeResources(env_7);
        if (result_7)
            await result_7;
    }
});
it('connects with "connect(path, callback)"', async () => {
    const env_8 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_8, await createUnixSocketServer(), true);
        const connectionCallback = vi.fn();
        const socket = net.connect(server.socketPath, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
    }
    catch (e_8) {
        env_8.error = e_8;
        env_8.hasError = true;
    }
    finally {
        const result_8 = __disposeResources(env_8);
        if (result_8)
            await result_8;
    }
});
it('connects with "connect(options)" and the "path" option', async () => {
    const env_9 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_9, await createUnixSocketServer(), true);
        const socket = net.connect({ path: server.socketPath });
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
        });
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(Buffer.concat(receivedChunks).toString()).toBe('hello from server');
    }
    catch (e_9) {
        env_9.error = e_9;
        env_9.hasError = true;
    }
    finally {
        const result_9 = __disposeResources(env_9);
        if (result_9)
            await result_9;
    }
});
it('throws on a URL argument without a port, like Node.js', async () => {
    /**
     * @note Node.js does not support URL arguments. It treats them as
     * a plain options object, reading "url.port" (an empty string when
     * the URL has no explicit port), and throws synchronously.
     */
    expect(() => {
        return net.connect(new URL('http://example.com/'));
    }).toThrow('Port should be >= 0 and < 65536');
});
it('fails to connect with a URL argument, like Node.js', async () => {
    const env_10 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_10, await createTestServer(() => {
            return new net.Server(() => { });
        })
        /**
         * @note Node.js reads "url.host" as the host, which includes the
         * port. Such a hostname never resolves, so the connection fails
         * even when the URL points at a live server.
         */
        , true);
        /**
         * @note Node.js reads "url.host" as the host, which includes the
         * port. Such a hostname never resolves, so the connection fails
         * even when the URL points at a live server.
         */
        const socket = net.connect(new URL(`http://${server.hostname}:${server.port}/`));
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.error).toHaveBeenCalledOnce();
        const [connectionError] = listeners.error.mock.calls[0];
        expect.soft(connectionError.code).toBe('ENOTFOUND');
        expect.soft(connectionError.hostname).toBe(`${server.hostname}:${server.port}`);
        expect(listeners.connect).not.toHaveBeenCalled();
    }
    catch (e_10) {
        env_10.error = e_10;
        env_10.hasError = true;
    }
    finally {
        const result_10 = __disposeResources(env_10);
        if (result_10)
            await result_10;
    }
});
it('connects with "createConnection()"', async () => {
    const env_11 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_11, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const connectionCallback = vi.fn();
        const socket = net.createConnection(server.port, server.hostname, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(listeners.connect).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
    }
    catch (e_11) {
        env_11.error = e_11;
        env_11.hasError = true;
    }
    finally {
        const result_11 = __disposeResources(env_11);
        if (result_11)
            await result_11;
    }
});
