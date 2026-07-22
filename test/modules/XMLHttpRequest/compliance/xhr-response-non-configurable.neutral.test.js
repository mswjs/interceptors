// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/msw/issues/2307
 */
import { FetchResponse } from '@mswjs/interceptors';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral';
import { getTestServer } from '#/test/setup/vitest';
const IS_BROWSER = typeof window !== 'undefined' && !('happyDOM' in window);
const server = getTestServer();
const interceptor = new XMLHttpRequestInterceptor();
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
 * @note Chromium stalls a request that receives an actual
 * "101 Switching Protocols" response, awaiting the protocol upgrade.
 */
it.skipIf(IS_BROWSER)('handles non-configurable responses from the actual server', async ({ task }) => {
    const responseListener = vi.fn();
    interceptor.on('response', responseListener);
    const url = server.http.url('/status');
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.send('101');
    await waitForXMLHttpRequest(request);
    expect.soft(request.status).toBe(101);
    expect.soft(request.statusText).toBe('Switching Protocols');
    expect.soft(request.responseText).toBe('');
    const hasPreflight = task.file.projectName !== 'browser';
    expect(responseListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1);
    if (hasPreflight) {
        const [{ request, response }] = responseListener.mock.calls[0];
        expect.soft(request.method).toBe('OPTIONS');
        expect.soft(request.url).toBe(url.href);
        expect.soft(response.status).toBe(200);
    }
    {
        const [{ request, response }] = responseListener.mock.calls[hasPreflight ? 1 : 0];
        expect.soft(request.method).toBe('POST');
        expect.soft(request.url).toBe(url.href);
        expect.soft(response.status).toBe(101);
    }
});
it('supports mocking non-configurable responses', async ({ task }) => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.method === 'OPTIONS') {
            return controller.respondWith(new Response(null, {
                status: 204,
                headers: { 'access-control-allow-origin': '*' },
            }));
        }
        /**
         * @note The Fetch API `Response` will still error on
         * non-configurable status codes. Instead, use this helper class.
         */
        controller.respondWith(new FetchResponse(null, { status: 101 }));
    });
    const responseListener = vi.fn();
    interceptor.on('response', responseListener);
    const request = new XMLHttpRequest();
    request.open('GET', 'http://any.host.here/irrelevant');
    request.send();
    await waitForXMLHttpRequest(request);
    expect.soft(request.status).toBe(101);
    expect.soft(request.response).toBe('');
    const hasPreflight = task.file.projectName !== 'browser';
    expect(responseListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1);
    if (hasPreflight) {
        const [{ request, response }] = responseListener.mock.calls[0];
        expect.soft(request.method).toBe('OPTIONS');
        expect.soft(request.url).toBe('http://any.host.here/irrelevant');
        expect.soft(response.status).toBe(204);
    }
    {
        const [{ request, response }] = responseListener.mock.calls[hasPreflight ? 1 : 0];
        expect.soft(request.method).toBe('GET');
        expect.soft(request.url).toBe('http://any.host.here/irrelevant');
        expect.soft(response.status).toBe(101);
    }
});
