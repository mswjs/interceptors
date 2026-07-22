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
import { invariant } from 'outvariant';
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
it('exposes empty address information before connecting', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new net.Server(() => { });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        expect.soft(socket.remoteAddress).toBeUndefined();
        expect.soft(socket.remotePort).toBeUndefined();
        expect.soft(socket.remoteFamily).toBeUndefined();
        expect.soft(socket.localAddress).toBeUndefined();
        expect.soft(socket.localPort).toBeUndefined();
        expect(socket.address()).toEqual({});
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
it('exposes address information after connecting', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return new net.Server(() => { });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remoteAddress).toBe('127.0.0.1');
        expect.soft(socket.remotePort).toBe(server.port);
        expect.soft(socket.remoteFamily).toBe('IPv4');
        expect.soft(socket.localAddress).toBe('127.0.0.1');
        expect.soft(socket.localPort).toEqual(expect.any(Number));
        expect(socket.address()).toEqual({
            address: '127.0.0.1',
            family: 'IPv4',
            port: socket.localPort,
        });
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
it('exposes address information for a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = net.connect(1337, '127.0.0.1');
    const { listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    expect.soft(socket.remoteAddress).toBe('127.0.0.1');
    expect.soft(socket.remotePort).toBe(1337);
    expect.soft(socket.remoteFamily).toBe('IPv4');
    expect.soft(socket.localAddress).toBe('127.0.0.1');
    expect.soft(socket.localPort).toEqual(expect.any(Number));
    expect(socket.address()).toEqual({
        address: '127.0.0.1',
        family: 'IPv4',
        port: socket.localPort,
    });
    socket.destroy();
});
it('exposes address information for a mocked IPv6 connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = net.connect(1337, '::1');
    const { listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    expect.soft(socket.remoteAddress).toBe('::1');
    expect.soft(socket.remotePort).toBe(1337);
    expect.soft(socket.remoteFamily).toBe('IPv6');
    expect.soft(socket.localAddress).toBe('::1');
    expect.soft(socket.localPort).toEqual(expect.any(Number));
    expect(socket.address()).toEqual({
        address: '::1',
        family: 'IPv6',
        port: socket.localPort,
    });
    socket.destroy();
});
it('exposes IPv6 address information for a mocked connection with the "family" option', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    // The hostname alone does not describe the IP family.
    // The "family" option must trigger the IPv6 address info.
    const socket = net.connect({
        port: 1337,
        host: 'example.test',
        family: 6,
    });
    const { listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    expect.soft(socket.remoteAddress).toBe('::1');
    expect.soft(socket.remotePort).toBe(1337);
    expect.soft(socket.remoteFamily).toBe('IPv6');
    expect.soft(socket.localAddress).toBe('::1');
    expect.soft(socket.localPort).toEqual(expect.any(Number));
    expect(socket.address()).toEqual({
        address: '::1',
        family: 'IPv6',
        port: socket.localPort,
    });
    socket.destroy();
});
it('respects the "localAddress" and "localPort" options for a mocked connection', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = net.connect({
        port: 1337,
        host: '127.0.0.1',
        localAddress: '127.0.0.1',
        localPort: 56789,
    });
    const { listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    expect.soft(socket.localAddress).toBe('127.0.0.1');
    expect.soft(socket.localPort).toBe(56789);
    expect(socket.address()).toEqual({
        address: '127.0.0.1',
        family: 'IPv4',
        port: 56789,
    });
    socket.destroy();
});
it('keeps the remote address information after the mocked connection is destroyed', async () => {
    interceptor.on('connection', ({ controller }) => {
        controller.claim();
    });
    const socket = net.connect(1337, '127.0.0.1');
    const { listeners } = spyOnSocket(socket);
    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
    /**
     * @note Read the remote address info while connected so it gets
     * cached on the socket. Node.js only keeps the cached values after
     * the socket is destroyed; unread values become undefined.
     */
    expect.soft(socket.remoteAddress).toBe('127.0.0.1');
    expect.soft(socket.remotePort).toBe(1337);
    expect.soft(socket.remoteFamily).toBe('IPv4');
    socket.destroy();
    await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
    expect.soft(socket.remoteAddress).toBe('127.0.0.1');
    expect.soft(socket.remotePort).toBe(1337);
    expect.soft(socket.remoteFamily).toBe('IPv4');
    expect.soft(socket.localPort).toBeUndefined();
    expect(socket.address()).toEqual({});
});
it('exposes address information after connecting over IPv6', async () => {
    const server = new net.Server(() => { });
    await new Promise((resolve, reject) => {
        server.listen(0, '::1', () => {
            resolve();
        });
        server.once('error', reject);
    });
    const serverAddress = server.address();
    invariant(serverAddress != null && typeof serverAddress === 'object', 'Failed to retrieve the test server address');
    try {
        const socket = net.connect({
            port: serverAddress.port,
            host: '::1',
            family: 6,
        });
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.remoteAddress).toBe('::1');
        expect.soft(socket.remotePort).toBe(serverAddress.port);
        expect.soft(socket.remoteFamily).toBe('IPv6');
        expect.soft(socket.localAddress).toBe('::1');
        expect(socket.address()).toEqual({
            address: '::1',
            family: 'IPv6',
            port: socket.localPort,
        });
        socket.destroy();
    }
    finally {
        server.close();
    }
});
it('respects the "localPort" connection option', async () => {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_3, await createTestServer(() => {
            return new net.Server(() => { });
        })
        // Open a server to obtain a free port, then close it
        // so that port can be used as the local port below.
        , true);
        // Open a server to obtain a free port, then close it
        // so that port can be used as the local port below.
        const portServer = await createTestServer(() => {
            return new net.Server();
        });
        const freeLocalPort = portServer.port;
        await portServer[Symbol.asyncDispose]();
        const socket = net.connect({
            port: server.port,
            host: server.hostname,
            localPort: freeLocalPort,
        });
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        expect.soft(socket.localPort).toBe(freeLocalPort);
        expect(socket.localAddress).toBe('127.0.0.1');
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
it('keeps the remote address information after the connection is destroyed', async () => {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_4, await createTestServer(() => {
            return new net.Server(() => { });
        }), true);
        const socket = net.connect(server.port, server.hostname);
        const { listeners } = spyOnSocket(socket);
        await expect.poll(() => listeners.ready).toHaveBeenCalledOnce();
        /**
         * @note Read the remote address info while connected so it gets
         * cached on the socket. Node.js only keeps the cached values after
         * the socket is destroyed; unread values become undefined.
         */
        expect.soft(socket.remoteAddress).toBe('127.0.0.1');
        expect.soft(socket.remotePort).toBe(server.port);
        expect.soft(socket.remoteFamily).toBe('IPv4');
        socket.destroy();
        await expect.poll(() => listeners.close).toHaveBeenCalledOnce();
        expect.soft(socket.remoteAddress).toBe('127.0.0.1');
        expect.soft(socket.remotePort).toBe(server.port);
        expect.soft(socket.remoteFamily).toBe('IPv4');
        expect.soft(socket.localPort).toBeUndefined();
        expect(socket.address()).toEqual({});
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
