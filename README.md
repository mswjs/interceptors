![https://www.npmjs.com/package/node-request-interceptor](https://img.shields.io/npm/v/node-request-interceptor.svg)
![https://app.circleci.com/pipelines/github/open-draft/node-request-interceptor](https://img.shields.io/circleci/project/github/open-draft/node-request-interceptor/master.svg)

# `node-request-interceptor`

Low-level HTTP/HTTPS/XHR request interception library for NodeJS.

**Allows to intercept requests issued by:**

- `http.request()`/`https.request()`
- `http.get()`/`https.get()`
- `fetch()`
- `XMLHttpRequest`
- Any third-party implementations that utilize the above (i.e. `node-fetch`, `axios`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API that includes request matching, retries, and so forth.

This library is a strip-to-bone implementation that provides as little abstraction as possible to execute arbitrary logic upon any request in NodeJS. It's primarily designed as an underlying component for a high-level API mocking solutions.

### Why XMLHttpRequest?

Although NodeJS comes with no `XMLHttpRequest` implementation, this library still covers it for the sake of processes that run in NodeJS emulating browser-like environments (i.e. `js-dom` in Jest).

## What this library does

This library monkey-patches the following native functions:

- `http.request`/`https.request`
- `http.get`/`https.get`
- `XMLHttpRequest`

After patching it provides an interface to listen to outgoing requests regardless of whichever of aforementioned functions issues a request.

- Pass-through by default, does not affect the network communication.
- Supports mocking a response by returning an object from the request middleware.

## What this library doesn't do

- Does not provide any request matching logic.
- Does not decide how to handle a request.
- Does not run in a browser environment (although supports `js-dom`).

## Getting started

### Install

```bash
npm install node-request-interceptor
```

### Use

```js
import { RequestInterceptor } from 'node-request-interceptor'

const interceptor = new RequestInterceptor()

interceptor.use((req) => {
  // Execute arbitrary logic whenever any request happens.
  // `req` contains information about the intercepted request,
  // regardless of its origins (http/https/xhr).
  if (req.url === 'https://non-existing.url') {
    // (Optional) Return an abstract mocked response that is later coerced
    // into a proper response instance depending on the request origin.
    return {
      status: 301,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mocked: true,
      }),
    }
  }
})

// Restore replaced instances (cleanup)
interceptor.restore()
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
