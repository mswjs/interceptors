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
it('emits correct events for a passthrough connection', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const serverConnectionListener = vi.fn();
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => {
                serverConnectionListener(socket);
                socket.end();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners, events } = spyOnSocket(socket);
        socket.resume();
        expect(socket.connecting).toBe(true);
        await expect.poll(() => listeners.connect).toHaveBeenCalledOnce();
        expect.soft(socket.connecting).toBe(false);
        expect
            .soft(events)
            .toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['end'],
            ['close', false],
        ]);
        expect(socket.connecting).toBe(false);
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
it('emits the "lookup" event when connecting to a hostname', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const socket = net.connect({
            port: server.port,
            host: 'localhost',
            family: 4,
        });
        const { listeners, events } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(events).toEqual([
            ['lookup', null, '127.0.0.1', 4, 'localhost'],
            ['connectionAttempt', '127.0.0.1', server.port, 4],
            ['connect'],
            ['ready'],
            ['end'],
            ['close', false],
        ]);
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
it('emits correct events for a refused connection', async () => {
    // Open a server to obtain a port, then close it
    // so connecting to that port is guaranteed to be refused.
    const closedServer = await createTestServer(() => {
        return new net.Server();
    });
    const refusedPort = closedServer.port;
    await closedServer[Symbol.asyncDispose]();
    const socket = net.connect(refusedPort, '127.0.0.1');
    const { listeners, events } = spyOnSocket(socket);
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    const connectionError = expect.objectContaining({
        code: 'ECONNREFUSED',
        syscall: 'connect',
        address: '127.0.0.1',
        port: refusedPort,
    });
    expect.soft(events).toEqual([
        ['connectionAttempt', '127.0.0.1', refusedPort, 4],
        ['connectionAttemptFailed', '127.0.0.1', refusedPort, 4, connectionError],
        ['error', connectionError],
        ['close', true],
    ]);
    // The failed connection must never report the socket as connected.
    expect.soft(listeners.connect).not.toHaveBeenCalled();
    expect.soft(listeners.error).toHaveBeenCalledOnce();
    expect(listeners.close).toHaveBeenCalledOnce();
});
it('emits events in the correct order when the client ends the connection', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.resume();
                socket.on('end', () => {
                    socket.end();
                });
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners, events } = spyOnSocket(socket);
        // Spy on the "finish" event manually since it's not a part
        // of the standard socket event spy list.
        socket.on('finish', () => {
            events.push(['finish']);
        });
        socket.resume();
        socket.once('ready', () => {
            socket.write('hello');
            socket.end();
        });
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(events).toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['finish'],
            ['end'],
            ['close', false],
        ]);
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
it('emits events in the correct order when the server ends a paused connection', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.write('hello');
                socket.end();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners, events } = spyOnSocket(socket);
        socket.pause();
        await expect.poll(() => listeners.connect).toHaveBeenCalledOnce();
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });
        // A paused socket must not receive the sent data or emit
        // "end"/"close" even after the server closes the connection.
        // The unread data (and the end-of-stream) stay buffered until read.
        expect.soft(listeners.data).not.toHaveBeenCalled();
        expect.soft(listeners.end).not.toHaveBeenCalled();
        expect.soft(listeners.close).not.toHaveBeenCalled();
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(events).toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['data', Buffer.from('hello')],
            ['end'],
            ['close', false],
        ]);
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
it('emits "close" when destroying a paused connection with unread data', async () => {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_5, await createTestServer(() => {
            return new net.Server((socket) => {
                // The client destroys the connection with unread data,
                // making the kernel send RST to the server.
                socket.on('error', () => { });
                socket.write('hello');
                socket.end();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners, events } = spyOnSocket(socket);
        socket.pause();
        await expect.poll(() => listeners.connect).toHaveBeenCalledOnce();
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });
        // Destroy the socket with the received data (and the end-of-stream)
        // still unread. The buffered data is discarded, and the socket must
        // still complete its teardown with the "close" event.
        socket.destroy();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(events).toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['close', false],
        ]);
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
it('does not emit "timeout" during an active transfer', async () => {
    const env_6 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_6, await createTestServer(() => {
            return new net.Server((socket) => {
                // Stream chunks with pauses shorter than the client's
                // idle timeout for a total duration exceeding that timeout.
                let sentChunkCount = 0;
                const interval = setInterval(() => {
                    socket.write('chunk');
                    sentChunkCount += 1;
                    if (sentChunkCount === 8) {
                        clearInterval(interval);
                        socket.end();
                    }
                }, 100);
                socket.on('close', () => clearInterval(interval));
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        socket.setTimeout(500);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect
            .poll(() => listeners.end, { timeout: 4000 })
            .toHaveBeenCalledOnce();
        // Incoming data refreshes the idle timer, so the timeout
        // must never fire during an active transfer.
        expect(listeners.timeout).not.toHaveBeenCalled();
        socket.destroy();
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
it('emits "timeout" when the socket goes idle after a transfer', async () => {
    const env_7 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_7, await createTestServer(() => {
            return new net.Server((socket) => {
                // Respond once, then keep the connection open and silent.
                socket.write('hello');
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.data).toHaveBeenCalledOnce();
        // Set the timeout only after the transfer has finished.
        socket.setTimeout(200);
        await expect.poll(() => listeners.timeout).toHaveBeenCalledOnce();
        socket.destroy();
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
it('emits "timeout" on an idle socket without destroying it', async () => {
    const env_8 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_8, await createTestServer(() => {
            return new net.Server(() => { });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        socket.setTimeout(200);
        await expect.poll(() => listeners.timeout).toHaveBeenCalledOnce();
        // Timing out must not destroy the socket (parity with Node.js).
        expect.soft(socket.destroyed).toBe(false);
        expect.soft(listeners.error).not.toHaveBeenCalled();
        expect(listeners.close).not.toHaveBeenCalled();
        socket.destroy();
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
it('emits "drain" after a write that exceeded the write buffer', async () => {
    const env_9 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_9, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.resume();
            });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        // Writing past the high water mark must communicate backpressure.
        expect(socket.write(Buffer.alloc(4 * 1024 * 1024))).toBe(false);
        await expect.poll(() => listeners.drain).toHaveBeenCalledOnce();
        socket.destroy();
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
it('invokes the connection callback exactly once', async () => {
    const env_10 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_10, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const connectionCallback = vi.fn();
        const socket = net.connect(server.port, server.hostname, connectionCallback);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(connectionCallback).toHaveBeenCalledOnce();
        expect(listeners.connect).toHaveBeenCalledOnce();
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
