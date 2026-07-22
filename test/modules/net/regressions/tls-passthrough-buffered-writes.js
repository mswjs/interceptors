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
/**
 * @vitest-environment node
 * @note This test is intentionally omitted in the main test run.
 * It's meant to be spawned in a child process by the actual test
 * because the regression it reproduces crashes the Node.js process
 * with a native, uncatchable "Assertion failed: !current_write_"
 * abort in "TLSWrap::DoWrite" ("crypto_tls.cc").
 *
 * The crash: flushing multiple buffered writes to the real
 * passthrough TLS socket via direct "_writeGeneric" calls bypasses
 * the Writable queue. While the real socket is still connecting,
 * each such call defers itself to the "connect" event, and on
 * connect they replay back-to-back, issuing concurrent writes on
 * the TLSWrap handle that only supports one write in flight.
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import tls from 'node:tls';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { SocketInterceptor } from '#/src/interceptors/net';
import { createTestServer } from '#/test/helpers';
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from '../compliance/fixtures/tls';
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
 * Delays the connection of a socket by the given time.
 * A server cannot delay an inbound TCP connection (the kernel
 * completes the handshake before "accept"), so the connection
 * delay is emulated on the client via a slow "lookup". The real
 * passthrough socket inherits it, staying in the "connecting"
 * state while the buffered writes are flushed to it (the same
 * window a slow external connect opens).
 */
function createDelayedLookup(delayMs) {
    return (hostname, options, callback) => {
        setTimeout(() => {
            if (options.all) {
                callback(null, [{ address: '127.0.0.1', family: 4 }]);
                return;
            }
            callback(null, '127.0.0.1', 4);
        }, delayMs);
    };
}
it('flushes multiple buffered writes to a connecting passthrough tls socket', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const serverReceivedData = new DeferredPromise();
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return new tls.Server({ cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY }, (socket) => {
                const chunks = [];
                socket.on('data', (chunk) => {
                    chunks.push(chunk);
                    const data = Buffer.concat(chunks).toString('utf8');
                    if (data === 'chunk-onechunk-two') {
                        serverReceivedData.resolve(data);
                    }
                });
            });
        })
        // Delay the passthrough decision so the client writes below
        // accumulate as separate buffered writes on the socket controller.
        , true);
        // Delay the passthrough decision so the client writes below
        // accumulate as separate buffered writes on the socket controller.
        interceptor.on('connection', async ({ controller }) => {
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });
            controller.passthrough();
        });
        const socket = tls.connect({
            host: 'localhost',
            port: server.port,
            rejectUnauthorized: false,
            lookup: createDelayedLookup(100),
        });
        socket.once('secureConnect', () => {
            socket.write('chunk-one');
            // Write the second chunk in a separate tick so it becomes
            // a separate pending write instead of joining the first one.
            setTimeout(() => {
                socket.write('chunk-two');
            }, 10);
        });
        await expect(serverReceivedData).resolves.toBe('chunk-onechunk-two');
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
