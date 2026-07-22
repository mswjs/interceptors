// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral';
import { getTestServer } from '#/test/setup/vitest';
const server = getTestServer();
const interceptor = new XMLHttpRequestInterceptor();
beforeAll(() => {
    interceptor.apply();
});
afterAll(() => {
    interceptor.dispose();
});
it('ignores casing when retrieving response headers via "getResponseHeader"', async () => {
    // The test server echoes the request headers in the response.
    const request = new XMLHttpRequest();
    request.open('GET', server.http.url('/account'));
    request.setRequestHeader('x-response-type', 'bypass');
    request.send();
    await waitForXMLHttpRequest(request);
    expect(request.getResponseHeader('x-response-type')).toBe('bypass');
    expect(request.getResponseHeader('X-response-Type')).toBe('bypass');
    expect(request.getResponseHeader('X-RESPONSE-TYPE')).toBe('bypass');
});
