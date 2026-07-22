import { DeferredPromise } from '@open-draft/deferred-promise';
import { RequestController } from '@mswjs/interceptors';
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
it('intercepts a request constructed via a "Request" instance', async () => {
    const requestBodyPromise = new DeferredPromise();
    const requestEventPromise = new DeferredPromise();
    interceptor.on('request', ({ request, requestId, controller }) => {
        // Read the request body via a clone because the bypassed
        // request consumes the original body.
        requestBodyPromise.resolve(request.clone().text());
        requestEventPromise.resolve({ request, requestId, controller });
    });
    const request = new Request(server.http.url('/user'), {
        method: 'POST',
        headers: {
            'content-type': 'text/plain',
            'x-origin': 'interceptors',
        },
        body: 'hello world',
    });
    const response = await fetch(request);
    // There's no mocked response returned from the listener
    // so this request must hit the actual test server.
    // The test server echoes the request body.
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('hello world');
    const { request: interceptedRequest, requestId, controller, } = await requestEventPromise;
    expect(interceptedRequest.method).toBe('POST');
    expect(interceptedRequest.url).toBe(server.http.url('/user').href);
    expect(interceptedRequest.headers.get('content-type')).toBe('text/plain');
    expect(interceptedRequest.headers.get('x-origin')).toBe('interceptors');
    expect(interceptedRequest.credentials).toBe('same-origin');
    await expect(requestBodyPromise).resolves.toBe('hello world');
    expect(controller).toBeInstanceOf(RequestController);
    expect(requestId).toMatch(/^\w{9,}$/);
});
