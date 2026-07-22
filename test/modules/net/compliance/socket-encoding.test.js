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
const encodedWrites = [
    { encoding: 'latin1', input: 'héllo wörld' },
    { encoding: 'base64', input: Buffer.from('hello world').toString('base64') },
    { encoding: 'utf16le', input: 'hello world' },
];
for (const { encoding, input } of encodedWrites) {
    it(`delivers a "${encoding}" encoded write byte-identical`, async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const serverReceivedChunks = [];
            const serverEndListener = vi.fn();
            const server = __addDisposableResource(env_1, await createTestServer(() => {
                return new net.Server((socket) => {
                    socket.on('data', (chunk) => {
                        serverReceivedChunks.push(chunk);
                    });
                    socket.on('end', serverEndListener);
                });
            }), true);
            const socket = net.connect(server.port, server.hostname);
            const { listeners } = spyOnSocket(socket);
            socket.resume();
            await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
            socket.write(input, encoding);
            socket.end();
            await expect.poll(() => serverEndListener).toHaveBeenCalledOnce();
            expect(Buffer.concat(serverReceivedChunks)).toEqual(Buffer.from(input, encoding));
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
}
it('flushes corked writes as a single chunk', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const serverReceivedChunks = [];
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.on('data', (chunk) => {
                    serverReceivedChunks.push(chunk);
                });
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        socket.cork();
        socket.write('hello ');
        socket.write('world');
        socket.uncork();
        await expect
            .poll(() => Buffer.concat(serverReceivedChunks).toString())
            .toBe('hello world');
        expect(serverReceivedChunks).toHaveLength(1);
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
it('receives the response as a string after "setEncoding()"', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end('hello world');
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
        });
        await expect.poll(() => listeners.end).toHaveBeenCalledOnce();
        expect.soft(receivedChunks.every((chunk) => typeof chunk === 'string')).toBe(true);
        expect(receivedChunks.join('')).toBe('hello world');
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
it('receives the response in the encoding set by "setEncoding()"', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end('hello world');
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.setEncoding('hex');
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
        });
        await expect.poll(() => listeners.end).toHaveBeenCalledOnce();
        expect(receivedChunks.join('')).toBe(Buffer.from('hello world').toString('hex'));
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
