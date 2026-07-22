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
// @vitest-environment happy-dom
import http from 'node:http';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest';
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest/node';
import { FetchInterceptor } from '#/src/interceptors/fetch/node';
import { createTestServer, toWebResponse } from '#/test/helpers';
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral';
const fetchInterceptor = new FetchInterceptor();
const clientRequestInterceptor = new ClientRequestInterceptor();
const xmlHttpRequestInterceptor = new XMLHttpRequestInterceptor();
beforeAll(() => {
    fetchInterceptor.apply();
    clientRequestInterceptor.apply();
    xmlHttpRequestInterceptor.apply();
});
afterEach(() => {
    fetchInterceptor.removeAllListeners();
    clientRequestInterceptor.removeAllListeners();
    xmlHttpRequestInterceptor.removeAllListeners();
});
afterAll(() => {
    fetchInterceptor.dispose();
    clientRequestInterceptor.dispose();
    xmlHttpRequestInterceptor.dispose();
});
it('does not attribute a ClientRequest to a preceding fetch request', async () => {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_1, await createTestServer(() => {
            return http.createServer((_request, response) => {
                response.end('original');
            });
        }), true);
        const fetchRequestListener = vi.fn();
        fetchInterceptor.on('request', ({ request, controller }) => {
            fetchRequestListener(request.url);
            if (request.url === 'http://localhost/mocked') {
                controller.respondWith(new Response('mocked'));
            }
        });
        const clientRequestInitiator = new DeferredPromise();
        clientRequestInterceptor.on('request', ({ initiator }) => {
            clientRequestInitiator.resolve(initiator);
        });
        await expect(fetch('http://localhost/mocked').then((response) => response.text())).resolves.toBe('mocked');
        /**
         * @note An unrelated request performed after `fetch()` in the same
         * asynchronous scope. It must not inherit the fetch request as its
         * initiator and must not be routed to the fetch interceptor.
         */
        const request = http.get(server.http.url('/resource').href);
        const [response] = await toWebResponse(request);
        expect(fetchRequestListener).toHaveBeenCalledTimes(1);
        expect(fetchRequestListener).toHaveBeenCalledWith('http://localhost/mocked');
        await expect(clientRequestInitiator).resolves.toEqual(request);
        await expect(response.text()).resolves.toBe('original');
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
it('does not attribute a ClientRequest to a preceding XMLHttpRequest', async () => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const server = __addDisposableResource(env_2, await createTestServer(() => {
            return http.createServer((_request, response) => {
                response.end('original');
            });
        }), true);
        const xhrRequestListener = vi.fn();
        xmlHttpRequestInterceptor.on('request', ({ request, controller }) => {
            xhrRequestListener(request.url);
            if (request.url === 'http://localhost/mocked') {
                controller.respondWith(new Response('mocked', {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                    },
                }));
            }
        });
        const clientRequestInitiator = new DeferredPromise();
        clientRequestInterceptor.on('request', ({ initiator }) => {
            clientRequestInitiator.resolve(initiator);
        });
        const xmlHttpRequest = new XMLHttpRequest();
        xmlHttpRequest.open('GET', 'http://localhost/mocked');
        xmlHttpRequest.send();
        await waitForXMLHttpRequest(xmlHttpRequest);
        expect(xmlHttpRequest.responseText).toBe('mocked');
        /**
         * @note An unrelated request performed after the XMLHttpRequest in
         * the same asynchronous scope. It must not inherit that request as
         * its initiator and must not be routed to the XHR interceptor.
         */
        const request = http.get(server.http.url('/resource').href);
        const [response] = await toWebResponse(request);
        expect(xhrRequestListener).toHaveBeenCalledTimes(1);
        expect(xhrRequestListener).toHaveBeenCalledWith('http://localhost/mocked');
        await expect(clientRequestInitiator).resolves.toEqual(request);
        await expect(response.text()).resolves.toBe('original');
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
