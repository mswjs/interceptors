// @vitest-environment happy-dom
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
it('calls the "onloadend" handler when not returning a mocked response', async () => {
    const loadEndHandler = vi.fn();
    const loadEndListener = vi.fn();
    const request = new XMLHttpRequest();
    request.open('GET', server.http.url('/resource'));
    request.onloadend = loadEndHandler;
    request.addEventListener('loadend', loadEndListener);
    request.send(null);
    await waitForXMLHttpRequest(request);
    expect.soft(request.readyState).toBe(4);
    expect.soft(request.status).toBe(200);
    expect.soft(request.responseText).toBe('original-response');
    expect.soft(loadEndHandler).toHaveBeenCalledTimes(1);
    expect.soft(loadEndListener).toHaveBeenCalledTimes(1);
});
