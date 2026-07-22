// @vitest-environment node
import { Agent, fetch } from 'undici';
import { HttpRequestInterceptor } from '#/src/interceptors/http';
import { getTestServer } from '#/test/setup/vitest';
const server = getTestServer();
const interceptor = new HttpRequestInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('performs a passthrough request on a kept-alive socket after a mocked request', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (new URL(request.url).pathname === '/mocked') {
            /**
             * @note An explicit "Content-Length" makes the mocked response
             * self-delimiting, which allows the connection to stay alive.
             */
            controller.respondWith(new Response('mocked', {
                headers: {
                    'content-length': '6',
                },
            }));
        }
    });
    /**
     * @note With a single connection, Undici dispatches every request
     * onto the same kept-alive socket, so the passthrough requests
     * below reuse the socket claimed by the mocked exchange. Unlike
     * the "http.Agent", Undici does not emit the "free" event that
     * resets the socket state between the exchanges.
     */
    const dispatcher = new Agent({ connections: 1 });
    try {
        const mockedResponse = await fetch(server.http.url('/mocked'), {
            dispatcher,
        });
        await expect(mockedResponse.text()).resolves.toBe('mocked');
        const firstPassthroughResponse = await fetch(server.http.url('/get'), {
            dispatcher,
        });
        await expect(firstPassthroughResponse.text()).resolves.toBe('original-response');
        const secondPassthroughResponse = await fetch(server.http.url('/get'), {
            dispatcher,
        });
        await expect(secondPassthroughResponse.text()).resolves.toBe('original-response');
    }
    finally {
        await dispatcher.close();
    }
});
