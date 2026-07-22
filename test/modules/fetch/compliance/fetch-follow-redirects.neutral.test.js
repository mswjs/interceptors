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
it('follows a bypassed redirect response', async () => {
    const response = await fetch(server.http.url('/redirect'));
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    await expect(response.text()).resolves.toBe('destination-body');
});
it('follows a mocked redirect to the original server', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect(server.http.url('/redirect/destination'), 302));
        }
    });
    const response = await fetch(server.http.url('/original'));
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    await expect(response.text()).resolves.toBe('destination-body');
});
it('follows a mocked relative redirect to the original server', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(new Response(null, {
                status: 302,
                headers: { location: '/redirect/destination' },
            }));
        }
    });
    const response = await fetch(server.http.url('/original'));
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    await expect(response.text()).resolves.toBe('destination-body');
});
it('follows a mocked redirect to a mocked response', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect(server.http.url('/redirect/destination'), 302));
        }
        if (request.url.endsWith('/redirect/destination')) {
            return controller.respondWith(new Response('mocked response'));
        }
    });
    const response = await fetch(server.http.url('/original'));
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    await expect(response.text()).resolves.toBe('mocked response');
});
it('returns the redirect response as-is for a request with "manual" redirect mode', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect(server.http.url('/redirect/destination'), 301));
        }
    });
    const response = await fetch(server.http.url('/original'), {
        redirect: 'manual',
    });
    expect(response.status).toBe(301);
    expect(response.redirected).toBe(false);
    expect(response.headers.get('location')).toBe(server.http.url('/redirect/destination').href);
});
it('throws a network error on a redirect for a request with "error" redirect mode', async ({ task, }) => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect(server.http.url('/redirect/destination'), 301));
        }
    });
    await expect(fetch(server.http.url('/original'), {
        redirect: 'error',
    })).rejects.toThrow(task.file.projectName === 'browser' ? 'Failed to fetch' : 'fetch failed');
});
/**
 * @note Per the Fetch specification, following a redirect results in
 * a network error only if the request body cannot be re-read
 * (i.e. is a stream without a source).
 * @see https://fetch.spec.whatwg.org/#http-redirect-fetch
 */
it('throws a network error on a non-303 redirect with a streaming body', async ({ task, }) => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect(server.http.url('/redirect/destination'), 301));
        }
    });
    await expect(fetch(server.http.url('/original'), {
        method: 'POST',
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('hello world'));
                controller.close();
            },
        }),
        // @ts-expect-error Undocumented Node.js property.
        duplex: 'half',
    })).rejects.toThrow(task.file.projectName === 'browser' ? 'Failed to fetch' : 'fetch failed');
});
it('throws a network error on redirects to a non-HTTP scheme', async ({ task, }) => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect('wss://localhost', 302));
        }
    });
    await expect(fetch(server.http.url('/original'))).rejects.toThrow(task.file.projectName === 'browser' ? 'Failed to fetch' : 'fetch failed');
});
it('throws on a redirect with credentials for a "cors" request', async ({ task, }) => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect('http://user:password@localhost', 302));
        }
    });
    await expect(fetch(server.http.url('/original'), { mode: 'cors' })).rejects.toThrow(task.file.projectName === 'browser' ? 'Failed to fetch' : 'fetch failed');
});
it('coerces a 301/302 redirect for a POST request to a GET request', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect('http://localhost/redirected', 301));
        }
        if (request.method === 'GET' && request.url.endsWith('/redirected')) {
            // Infer response body from the request body.
            return controller.respondWith(new Response(request.clone().body, { headers: request.headers }));
        }
    });
    const response = await fetch(server.http.url('/original'), {
        method: 'POST',
        headers: {
            'content-language': 'en-US',
            'content-location': 'http://localhost/redirected',
            'content-type': 'application/json',
            'content-length': '0',
            'x-other-header': 'value',
        },
    });
    expect(response.status).toBe(200);
    // Must remove body-related request headers.
    expect(response.headers.get('content-language')).toBeNull();
    expect(response.headers.get('content-location')).toBeNull();
    expect(response.headers.get('content-type')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-other-header')).toBe('value');
    // The request body of the coerced GET request must be empty.
    await expect(response.text()).resolves.toBe('');
});
it('coerces a 303 redirect to a non-HEAD/GET request to a GET request', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect('http://localhost/redirected', 303));
        }
        if (request.method === 'GET' && request.url.endsWith('/redirected')) {
            // Infer response body from the request body.
            return controller.respondWith(new Response(request.clone().body, { headers: request.headers }));
        }
    });
    const response = await fetch(server.http.url('/original'), {
        method: 'POST',
        headers: {
            'content-language': 'en-US',
            'content-location': 'http://localhost/redirected',
            'content-type': 'application/json',
            'content-length': '0',
            'x-other-header': 'value',
        },
    });
    expect(response.status).toBe(200);
    // Must remove body-related request headers.
    expect(response.headers.get('content-language')).toBeNull();
    expect(response.headers.get('content-location')).toBeNull();
    expect(response.headers.get('content-type')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-other-header')).toBe('value');
    // The request body of the coerced GET request must be empty.
    await expect(response.text()).resolves.toBe('');
});
it('deletes sensitive request headers for a cross-origin redirect', async () => {
    interceptor.on('request', ({ request, controller }) => {
        if (request.url.endsWith('/original')) {
            return controller.respondWith(Response.redirect('https://example.com/redirected', 303));
        }
        if (request.url.endsWith('/redirected')) {
            return controller.respondWith(new Response(null, { headers: request.headers }));
        }
    });
    const response = await fetch(server.http.url('/original'), {
        headers: {
            authorization: 'Bearer TOKEN',
            'proxy-authorization': 'Bearer PROXY_TOKEN',
            cookie: 'a=1',
            'x-other-header': 'value',
        },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('authorization')).toBeNull();
    expect(response.headers.get('proxy-authorization')).toBeNull();
    expect(response.headers.get('cookie')).toBeNull();
    expect(response.headers.get('x-other-header')).toBe('value');
});
