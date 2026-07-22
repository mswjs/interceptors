import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { getTestServer } from '#/test/setup/vitest';
const server = getTestServer();
const interceptor = new FetchInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterAll(() => {
    interceptor.dispose();
});
it('bypasses requests after the interceptor is disposed', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('mocked'));
    });
    interceptor.dispose();
    const response = await fetch(server.http.url('/resource'));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('original-response');
});
