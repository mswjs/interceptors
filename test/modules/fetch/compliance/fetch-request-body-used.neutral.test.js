import { DeferredPromise } from '@open-draft/deferred-promise';
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
it('request body is unused in the listener when using Request argument', async () => {
    const requestInListenerPromise = new DeferredPromise();
    interceptor.on('request', ({ request }) => {
        requestInListenerPromise.resolve(request);
    });
    const request = new Request(server.http.url('/resource'), {
        method: 'POST',
        body: 'Hello server',
    });
    const bodyUsedBeforeFetch = request.bodyUsed;
    const responsePromise = fetch(request);
    const bodyUsedAfterFetch = request.bodyUsed;
    const requestInListener = await requestInListenerPromise;
    const bodyUsedInListener = requestInListener.bodyUsed;
    const response = await responsePromise;
    const bodyUsedAfterResponse = request.bodyUsed;
    expect(bodyUsedBeforeFetch).toBe(false);
    expect(bodyUsedInListener).toBe(false);
    // Fetch reads the request body in order to send it.
    expect(bodyUsedAfterFetch).toBe(true);
    expect(bodyUsedAfterResponse).toBe(true);
    // The test server echoes the request body.
    await expect(response.text()).resolves.toBe('Hello server');
});
it('request body is unused in the listener when using input and init arguments', async () => {
    const requestInListenerPromise = new DeferredPromise();
    interceptor.on('request', ({ request }) => {
        requestInListenerPromise.resolve(request);
    });
    const responsePromise = fetch(server.http.url('/resource'), {
        method: 'POST',
        body: 'Hello server',
    });
    const requestInListener = await requestInListenerPromise;
    const bodyUsedInListener = requestInListener.bodyUsed;
    const response = await responsePromise;
    expect(bodyUsedInListener).toBe(false);
    await expect(response.text()).resolves.toBe('Hello server');
});
