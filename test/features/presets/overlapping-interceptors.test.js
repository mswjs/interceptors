import { BatchInterceptor } from '@mswjs/interceptors';
import { HttpRequestInterceptor } from '@mswjs/interceptors/http';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
const interceptor = new BatchInterceptor({
    name: 'interceptor',
    interceptors: [new HttpRequestInterceptor(), new FetchInterceptor()],
});
beforeAll(() => {
    interceptor.apply();
});
afterEach(() => {
    interceptor.removeAllListeners();
});
afterAll(() => {
    interceptor.dispose();
});
it('does not handle the same request twice', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('hello world'));
    });
    const response = await fetch('http://localhost/api');
    await expect(response.text()).resolves.toBe('hello world');
});
