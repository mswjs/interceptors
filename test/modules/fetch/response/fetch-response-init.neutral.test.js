import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { getTestServer } from '#/test/setup/vitest';
/**
 * @note Allow requests to the test server despite its self-signed certificate.
 * Only applies to Node.js. In the browser, Playwright ignores certificate errors.
 */
if (typeof process !== 'undefined' && 'env' in process) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
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
describe.each(['http', 'https'])('%s', (protocol) => {
    it('respects a custom response init of a mocked response', async ({ task, }) => {
        interceptor.on('request', ({ controller }) => {
            controller.respondWith(new Response(JSON.stringify({ mocked: true }), {
                status: 201,
                statusText: 'Created',
                headers: {
                    'content-type': 'application/hal+json',
                },
            }));
        });
        const requestUrl = server[protocol].url('/resource');
        const response = await fetch(requestUrl);
        expect(response.url).toBe(requestUrl.href);
        expect(response.status).toBe(201);
        expect(response.statusText).toBe('Created');
        expect(response.headers.get('content-type')).toBe('application/hal+json');
        expect(response.type).toBe(task.file.projectName === 'browser' ? 'default' : 'basic');
        await expect(response.json()).resolves.toEqual({ mocked: true });
    });
    it('exposes the response init of a bypassed response', async ({ task }) => {
        const requestUrl = server[protocol].url('/resource');
        const response = await fetch(requestUrl);
        expect(response.url).toBe(requestUrl.href);
        expect(response.status).toBe(200);
        expect(response.statusText).toBe('OK');
        expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(response.type).toBe(task.file.projectName === 'browser' ? 'cors' : 'basic');
        await expect(response.text()).resolves.toBe('original-response');
    });
});
