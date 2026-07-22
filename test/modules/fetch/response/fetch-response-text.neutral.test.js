import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { getTestServer } from '#/test/setup/vitest';
const server = getTestServer();
const interceptor = new FetchInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('intercepts a bypassed request with a text response', async () => {
    const response = await fetch(server.http.url('/'), {
        method: 'POST',
        body: 'original',
    });
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('original');
});
it('responds with a text response to an HTTP request', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('hello world'));
    });
    const response = await fetch('http://localhost/irrelevant');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('hello world');
});
it('responds with a text response to an HTTPS request', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('hello world'));
    });
    const response = await fetch('https://localhost/irrelevant');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('hello world');
});
