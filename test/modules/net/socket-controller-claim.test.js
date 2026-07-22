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
it('resolves the connection attempt when the socket is claimed', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = net.connect(80, '127.0.0.1');
    const { listeners, events } = spyOnSocket(socket);
    socket.on('connect', () => socket.destroy());
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(events).toEqual([
        ['connectionAttempt', '127.0.0.1', 80, 4],
        ['connect'],
        ['ready'],
        ['close', false],
    ]);
});
it('has no effect claiming a connection destroyed by the client', async () => {
    const connectionEventReceived = new DeferredPromise();
    const clientDestroyed = new DeferredPromise();
    const claimResult = new DeferredPromise();
    interceptor.on('connection', async ({ controller }) => {
        connectionEventReceived.resolve();
        // Suspend the connection handling until the client
        // has destroyed the socket (e.g. aborted the request).
        await clientDestroyed;
        try {
            controller.claim();
            claimResult.resolve(undefined);
        }
        catch (error) {
            if (error instanceof Error) {
                claimResult.resolve(error);
            }
            else {
                claimResult.reject(error);
            }
        }
    });
    const socket = net.connect(80, '127.0.0.1');
    const { events } = spyOnSocket(socket);
    /**
     * @note Write only once the socket is connected (e.g. like Undici).
     * This makes the interceptor emulate the "connect" event, taking
     * the claim past the connected-socket check even after the client
     * destroys the socket.
     */
    const socketConnected = new DeferredPromise();
    socket.on('connect', () => {
        socket.write('hello');
        socketConnected.resolve();
    });
    await connectionEventReceived;
    await socketConnected;
    socket.destroy();
    clientDestroyed.resolve();
    await expect(claimResult).resolves.toBeUndefined();
    expect(socket.destroyed).toBe(true);
    expect(events).toEqual([
        ['connectionAttempt', '127.0.0.1', 80, 4],
        ['connect'],
    ]);
});
it('throws an error claiming an already claimed connection', async () => {
    expect.assertions(3);
    interceptor.on('connection', ({ socket, controller }) => {
        controller.claim();
        expect(() => controller.claim()).toThrow(`Failed to claim a socket connection: already handled (1)`);
        socket.end();
    });
    const socket = net.connect(80, '127.0.0.1');
    const { listeners, events } = spyOnSocket(socket);
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect(events).toEqual([
        ['connectionAttempt', '127.0.0.1', 80, 4],
        ['connect'],
        ['ready'],
        ['end'],
        ['close', false],
    ]);
});
it('throws an error claiming an already passthrough connection', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        expect.assertions(3);
        interceptor.on('connection', ({ controller }) => {
            controller.passthrough();
            expect(() => controller.claim()).toThrow(`Failed to claim a socket connection: already handled (2)`);
        });
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => socket.end());
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners, events } = spyOnSocket(socket);
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(events).toEqual([
            ['connectionAttempt', server.hostname, server.port, 4],
            ['connect'],
            ['ready'],
            ['end'],
            ['close', false],
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
