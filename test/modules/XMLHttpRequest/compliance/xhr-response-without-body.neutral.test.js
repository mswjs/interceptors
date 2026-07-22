import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral';
import { getTestServer } from '#/test/setup/vitest';
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
it('intercepts a bypassed request with a 204 response', async ({ task }) => {
    const responseListener = vi.fn();
    interceptor.on('response', responseListener);
    const url = server.http.url('/status');
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.send('204');
    await waitForXMLHttpRequest(request);
    expect(request.response).toBe('');
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
        expect.soft(response.status).toBe(204);
        expect.soft(response.url).toBe(url.href);
        expect.soft(response.body).toBeNull();
    }
});
it('intercepts a bypassed request with a 205 response', async ({ task }) => {
    const responseListener = vi.fn();
    interceptor.on('response', responseListener);
    const url = server.http.url('/status');
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.send('205');
    await waitForXMLHttpRequest(request);
    expect(request.response).toBe('');
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
        expect.soft(response.status).toBe(205);
        expect.soft(response.url).toBe(url.href);
        expect.soft(response.body).toBeNull();
    }
});
it('exposes a fetch api reference for a 304 response without body', async ({ task, }) => {
    const responseListener = vi.fn();
    interceptor.on('response', responseListener);
    const url = server.http.url('/cacheable');
    // First request populates the cache with ETag + max-age=0.
    {
        const request = new XMLHttpRequest();
        request.open('GET', url);
        request.send();
        await waitForXMLHttpRequest(request);
    }
    responseListener.mockClear();
    // Second request to the same URL triggers revalidation (If-None-Match),
    // and the server responds with 304.
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.send();
    await waitForXMLHttpRequest(request);
    expect(request.response).toBe('original-response');
    const hasPreflight = task.file.projectName !== 'browser';
    expect(responseListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1);
    if (hasPreflight) {
        const [{ request, response }] = responseListener.mock.calls[0];
        expect.soft(request.method).toBe('OPTIONS');
        expect.soft(request.url).toBe(url.href);
        expect.soft(response.status).toBe(200);
    }
    // Transparently resolved 304 (responded from the cache).
    {
        const [{ request, response }] = responseListener.mock.calls[hasPreflight ? 1 : 0];
        expect.soft(request.method).toBe('GET');
        expect.soft(request.url).toBe(url.href);
        expect.soft(response.status).toBe(200);
        expect.soft(response.url).toBe(url.href);
        await expect.soft(response.text()).resolves.toBe('original-response');
    }
});
