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
it('ends the connection before it is open', async () => {
    const reason = new Error('Custom reason');
    interceptor.on('connection', ({ socket }) => {
        socket.destroy(reason);
    });
    const socket = net.connect(80, '127.0.0.1');
    const { events, listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(socket.connecting).toBe(false);
    expect(socket.closed).toBe(true);
    expect(events).toEqual([
        ['error', reason],
        ['close', true],
    ]);
});
it('ends a mocked connection after it is open', async () => {
    const reason = new Error('Custom reason');
    interceptor.on('connection', ({ socket, controller }) => {
        socket.on('connect', () => socket.destroy(reason));
        controller.claim();
    });
    const socket = net.connect(80, '127.0.0.1');
    const { events, listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(events).toEqual([
        ['connectionAttempt', '127.0.0.1', 80, 4],
        ['connect'],
        ['ready'],
        ['error', reason],
        ['close', true],
    ]);
});
it('ends a passthrough connection after it is open', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const reason = new Error('Custom reason');
        interceptor.on('connection', ({ socket, controller }) => {
            socket.on('connect', () => socket.destroy(reason));
            controller.passthrough();
        });
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server(() => { });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { events, listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(socket.connecting).toBe(false);
        expect(socket.closed).toBe(true);
        expect(events).toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['error', reason],
            ['close', true],
        ]);
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
it('ends the connection during a write', async () => {
    const reason = new Error('Custom reason');
    interceptor.on('connection', ({ socket, controller }) => {
        socket.on('data', () => socket.destroy(reason));
        controller.claim();
    });
    const socket = net.connect(80, '127.0.0.1');
    const { events, listeners } = spyOnSocket(socket);
    socket.on('connect', () => socket.write('hello'));
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(socket.connecting).toBe(false);
    expect(socket.closed).toBe(true);
    expect(events).toEqual([
        ['connectionAttempt', '127.0.0.1', 80, 4],
        ['connect'],
        ['ready'],
        ['error', reason],
        ['close', true],
    ]);
});
it('has no effect if the client closed the connection', async () => {
    const serverReason = new Error('Server reason');
    interceptor.on('connection', ({ socket }) => {
        socket.destroy(serverReason);
    });
    const socket = net.connect(80, '127.0.0.1');
    const { events, listeners } = spyOnSocket(socket);
    const clientReason = new Error('Client reason');
    socket.destroy(clientReason);
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(socket.connecting).toBe(false);
    expect(socket.closed).toBe(true);
    expect(events).toEqual([
        ['error', clientReason],
        ['close', true],
    ]);
});
