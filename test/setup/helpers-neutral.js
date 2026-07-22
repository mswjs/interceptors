import { DeferredPromise } from '@open-draft/deferred-promise';
/**
 * Environment-agnostic, Promise-based "setTimeout".
 * The one from `node:timers/promises` is awesome but it won't run in the browser.
 */
export function setTimeout(duration) {
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, duration);
    });
}
export function waitForXMLHttpRequest(request, async = true) {
    const pendingResponse = new DeferredPromise();
    if (async) {
        request.addEventListener('abort', () => {
            pendingResponse.reject(new Error('Request aborted'));
        });
        request.addEventListener('loadend', () => {
            pendingResponse.resolve();
        });
    }
    else {
        if (request.readyState === XMLHttpRequest.DONE) {
            pendingResponse.resolve();
        }
        else {
            request.addEventListener('loadend', () => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    pendingResponse.resolve();
                }
            });
        }
    }
    return pendingResponse;
}
export function spyOnXMLHttpRequest(request) {
    const events = [];
    const addEvent = (name) => {
        return (event) => {
            if (event instanceof ProgressEvent) {
                events.push([
                    name,
                    request.readyState,
                    { loaded: event.loaded, total: event.total },
                ]);
            }
            else {
                events.push([name, request.readyState]);
            }
        };
    };
    request.addEventListener('readystatechange', addEvent('readystatechange'));
    request.addEventListener('progress', addEvent('progress'));
    request.addEventListener('loadstart', addEvent('loadstart'));
    request.addEventListener('load', addEvent('load'));
    request.addEventListener('loadend', addEvent('loadend'));
    request.addEventListener('timeout', addEvent('timeout'));
    request.addEventListener('error', addEvent('error'));
    request.addEventListener('abort', addEvent('abort'));
    return {
        events,
    };
}
export function spyOnXMLHttpRequestUpload(upload) {
    const events = [];
    const addUploadEvent = (name) => {
        return (event) => {
            events.push([name, { loaded: event.loaded, total: event.total }]);
        };
    };
    upload.addEventListener('loadstart', addUploadEvent('loadstart'));
    upload.addEventListener('progress', addUploadEvent('progress'));
    upload.addEventListener('load', addUploadEvent('load'));
    upload.addEventListener('loadend', addUploadEvent('loadend'));
    upload.addEventListener('abort', addUploadEvent('abort'));
    upload.addEventListener('error', addUploadEvent('error'));
    upload.addEventListener('timeout', addUploadEvent('timeout'));
    return {
        events,
    };
}
/**
 * @note Use this utility because in Node.js (JSDOM), "request.response"
 * becomes Uint8Array while in the browser it's correctly ArrayBuffer.
 */
export function toArrayBuffer(value) {
    if (value instanceof Uint8Array) {
        return value.buffer;
    }
    return value;
}
export function arrayBufferFrom(input) {
    return new TextEncoder().encode(input).buffer;
}
