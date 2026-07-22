// @vitest-environment node
import http from 'node:http';
import { HttpServer } from '@open-draft/test-server/http';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { HttpRequestInterceptor } from '#/src/interceptors/http';
const httpServer = new HttpServer((app) => {
    app.get('/resource', (request, res) => {
        res.status(200).send('hello world');
    });
});
const interceptor = new HttpRequestInterceptor();
interceptor.on('request', ({ request, controller }) => {
    const url = new URL(request.url);
    if (!url.searchParams.has('mock')) {
        return;
    }
    controller.respondWith(new Response('hello world', {
        status: 200,
        headers: {
            'Content-Type': 'text/plain',
        },
    }));
});
function encode(text, encoding) {
    return Buffer.from(text, 'utf8').toString(encoding);
}
function readIncomingMessage(res) {
    return new Promise((resolve, reject) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('error', reject);
        res.on('end', () => resolve(body));
    });
}
beforeAll(async () => {
    interceptor.apply();
    await httpServer.listen();
});
afterAll(async () => {
    await httpServer.close();
    interceptor.dispose();
});
const encodings = [
    'ascii',
    'base64',
    'binary',
    'hex',
    'latin1',
    'ucs2',
    'ucs-2',
    'utf16le',
    'utf8',
    'utf-8',
];
describe('given the original response', () => {
    encodings.forEach((encoding) => {
        it(`reads the response body encoded with ${encoding}`, async () => {
            const request = http.get(httpServer.http.url('/resource'));
            const responseTextReceived = new DeferredPromise();
            request.on('response', async (response) => {
                response.setEncoding(encoding);
                const text = await readIncomingMessage(response);
                responseTextReceived.resolve(text);
            });
            const responseText = await responseTextReceived;
            expect(responseText).toEqual(encode('hello world', encoding));
        });
    });
});
describe('given the mocked response', () => {
    encodings.forEach((encoding) => {
        it(`reads the response body encoded with ${encoding}`, async () => {
            const request = http.get(httpServer.http.url('/resource?mock=true'));
            const responseTextReceived = new DeferredPromise();
            request.on('response', async (response) => {
                response.setEncoding(encoding);
                const text = await readIncomingMessage(response);
                responseTextReceived.resolve(text);
            });
            const responseText = await responseTextReceived;
            expect(responseText).toEqual(encode('hello world', encoding));
        });
    });
});
