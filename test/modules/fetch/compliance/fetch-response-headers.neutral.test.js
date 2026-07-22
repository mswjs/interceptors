/**
 * @see https://github.com/mswjs/interceptors/pull/724
 */
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
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
it('responds with mocked headers defined using the Headers class', async () => {
    interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('hello world', {
            headers: new Headers({
                'content-encoding': 'gzip',
                'x-custom-header': 'yes',
            }),
        }));
    });
    const response = await fetch('http://localhost/');
    expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-encoding': 'gzip',
        'x-custom-header': 'yes',
    });
});
