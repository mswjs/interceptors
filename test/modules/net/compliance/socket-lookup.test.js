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
function createLookupFunction() {
    return (hostname, options, callback) => {
        if (options.all) {
            callback(null, [{ address: '127.0.0.1', family: 4 }]);
            return;
        }
        callback(null, '127.0.0.1', 4);
    };
}
it('invokes the custom "lookup" function', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const lookupFunction = vi.fn(createLookupFunction());
        const socket = net.connect({
            port: server.port,
            host: 'imaginary.example.com',
            lookup: lookupFunction,
        });
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect(lookupFunction).toHaveBeenCalledOnce();
        expect(lookupFunction).toHaveBeenCalledWith('imaginary.example.com', expect.objectContaining({ all: true }), expect.any(Function));
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
it('connects to the address resolved by the custom "lookup" function', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const serverConnectionListener = vi.fn();
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            /**
             * @note Keep the connection open so the remote address info
             * can be read while the socket is still connected.
             */
            return new net.Server(() => {
                serverConnectionListener();
            });
        }), true);
        const socket = net.connect({
            port: server.port,
            host: 'imaginary.example.com',
            lookup: createLookupFunction(),
        });
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remoteAddress).toBe('127.0.0.1');
        expect.soft(socket.remotePort).toBe(server.port);
        await expect.poll(() => serverConnectionListener).toHaveBeenCalledOnce();
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
it('resolves a passthrough connection with the custom "lookup" function', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end('hello from server');
            });
        }), true);
        interceptor.on('connection', ({ controller }) => {
            controller.passthrough();
        });
        // Resolve the imaginary hostname to the test server address.
        const lookupFunction = vi.fn(createLookupFunction());
        const socket = net.connect({
            port: server.port,
            host: 'imaginary.example.com',
            lookup: lookupFunction,
        });
        const { listeners } = spyOnSocket(socket);
        const receivedChunks = [];
        socket.on('data', (chunk) => {
            receivedChunks.push(chunk);
        });
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        // The custom lookup function must drive the passthrough connection.
        expect.soft(lookupFunction).toHaveBeenCalledWith('imaginary.example.com', expect.objectContaining({ all: true }), expect.any(Function));
        expect.soft(Buffer.concat(receivedChunks).toString()).toBe('hello from server');
        expect(listeners.error).not.toHaveBeenCalled();
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
it('errors a passthrough connection if the custom "lookup" function fails', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        interceptor.on('connection', ({ controller }) => {
            controller.passthrough();
        });
        const lookupFunction = vi.fn((...args) => {
            const callback = args[args.length - 1];
            callback(new Error('Custom lookup failure'));
        });
        const socket = net.connect({
            port: server.port,
            host: 'imaginary.example.com',
            lookup: lookupFunction,
        });
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(lookupFunction).toHaveBeenCalledOnce();
        expect
            .soft(listeners.error)
            .toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Custom lookup failure' }));
        expect.soft(listeners.close).toHaveBeenCalledWith(true);
        expect(listeners.connect).not.toHaveBeenCalled();
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
it('does not mutate the connection options', async () => {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_5, await createTestServer(() => {
            return new net.Server((socket) => {
                socket.end();
            });
        }), true);
        const lookupFunction = createLookupFunction();
        const connectionOptions = {
            port: server.port,
            host: server.hostname,
            lookup: lookupFunction,
        };
        const socket = net.connect(connectionOptions);
        const { listeners } = spyOnSocket(socket);
        socket.resume();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(Object.keys(connectionOptions)).toEqual([
            'port',
            'host',
            'lookup',
        ]);
        expect.soft(connectionOptions.port).toBe(server.port);
        expect.soft(connectionOptions.host).toBe(server.hostname);
        expect(connectionOptions.lookup).toBe(lookupFunction);
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
