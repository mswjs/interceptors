import { invariant } from 'outvariant';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { DeferredPromise } from '@open-draft/deferred-promise';
import { FetchResponse } from '#/src/utils/fetchUtils';
export const REQUEST_ID_REGEXP = /^\w{9,}$/;
export async function readBlob(blob) {
    const pendingResult = new DeferredPromise();
    const reader = new FileReader();
    reader.addEventListener('loadend', () => {
        pendingResult.resolve(reader.result);
    });
    reader.addEventListener('abort', () => pendingResult.reject());
    reader.addEventListener('error', () => pendingResult.reject());
    reader.readAsText(blob);
    return pendingResult;
}
export async function toWebResponse(request) {
    const pendingResponse = new DeferredPromise();
    request
        .on('response', (response) => {
        const responseBody = response.destroyed
            ? null
            : Readable.toWeb(response);
        const fetchResponse = new FetchResponse(responseBody, {
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: FetchResponse.parseRawHeaders(response.rawHeaders),
        });
        pendingResponse.resolve([fetchResponse, response]);
    })
        .on('error', (error) => pendingResponse.reject(error))
        .on('abort', () => pendingResponse.reject(new Error('Request aborted')));
    return pendingResponse;
}
export const useCors = (_req, res, next) => {
    res.set({
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': '*',
    });
    return next();
};
/**
 * Compress the given data using the specified `Content-Encoding` codings
 * left-to-right.
 */
export function compressResponse(codings, input) {
    let output = Buffer.from(input);
    for (const coding of codings) {
        if (coding === 'gzip' || coding === 'x-gzip') {
            output = zlib.gzipSync(output);
        }
        else if (coding === 'deflate') {
            output = zlib.deflateSync(output);
        }
        else if (coding === 'br') {
            output = zlib.brotliCompressSync(output);
        }
    }
    return output;
}
export async function createTestServer(createServer) {
    const server = createServer();
    const pendingListen = new DeferredPromise();
    server
        .listen(0, '127.0.0.1', () => pendingListen.resolve())
        .once('error', (error) => pendingListen.reject(error));
    await pendingListen;
    const rawAddress = server.address();
    invariant(rawAddress != null, 'Failed to open a test server: server address is null');
    invariant(typeof rawAddress === 'object' && 'port' in rawAddress, 'Failed to open a test server: server address is not AddressInfo');
    const createUrlHelper = (protocol) => {
        return (path) => {
            return new URL(path, new URL(`${protocol}://${rawAddress.address}:${rawAddress.port}`));
        };
    };
    return {
        async [Symbol.asyncDispose]() {
            const pendingClose = new DeferredPromise();
            server.close((error) => {
                if (error) {
                    return pendingClose.reject(error);
                }
                pendingClose.resolve();
            });
        },
        instance: server,
        port: rawAddress.port,
        hostname: rawAddress.address,
        http: {
            url: createUrlHelper('http'),
        },
        https: {
            url: createUrlHelper('https'),
        },
    };
}
export function spyOnSocket(socket) {
    const eventNames = [
        'lookup',
        'connectionAttempt',
        'connectionAttemptFailed',
        'connectionAttemptTimeout',
        'connect',
        'ready',
        'data',
        'drain',
        'end',
        'error',
        'timeout',
        'close',
    ];
    const events = [];
    const listeners = {};
    for (const eventName of eventNames) {
        listeners[eventName] = vi.fn((...args) => events.push([eventName, ...args]));
        socket.on(eventName, listeners[eventName]);
    }
    return {
        events,
        listeners,
    };
}
