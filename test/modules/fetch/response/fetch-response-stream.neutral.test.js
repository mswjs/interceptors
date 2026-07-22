import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { getTestServer } from '#/test/setup/vitest';
import { setTimeout } from '#/test/setup/helpers-neutral';
const server = getTestServer();
const interceptor = new FetchInterceptor();
const encoder = new TextEncoder();
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('intercepts a bypassed request with a stream response', async () => {
    const response = await fetch(server.http.url('/stream'), {
        method: 'POST',
        body: 'original',
    });
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('original');
});
it('responds with a stream response to an HTTP request', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response(new ReadableStream({
            async pull(controller) {
                controller.enqueue(encoder.encode('hello'));
                await setTimeout(100);
                controller.enqueue(encoder.encode(' '));
                await setTimeout(100);
                controller.enqueue(encoder.encode('world'));
                controller.close();
            },
        })));
    });
    const response = await fetch('http://localhost/irrelevant');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('hello world');
});
it('responds with a stream response to an HTTPS request', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response(new ReadableStream({
            async pull(controller) {
                controller.enqueue(encoder.encode('hello'));
                await setTimeout(100);
                controller.enqueue(encoder.encode(' '));
                await setTimeout(100);
                controller.enqueue(encoder.encode('world'));
                controller.close();
            },
        })));
    });
    const response = await fetch('https://localhost/irrelevant');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.text()).resolves.toBe('hello world');
});
