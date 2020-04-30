![https://www.npmjs.com/package/node-request-interceptor](https://img.shields.io/npm/v/node-request-interceptor.svg)
![https://app.circleci.com/pipelines/github/open-draft/node-request-interceptor](https://img.shields.io/circleci/project/github/open-draft/node-request-interceptor/master.svg)

# `node-request-interceptor`

Low-level HTTP/HTTPS/XHR request interception library for NodeJS.

**Intercepts any requests issued by:**

- `http.request`/`http.get`
- `https.request`/`https.get`
- `fetch`
- `XMLHttpRequest`
- Any third-party library that utilizes the above (for example `request`, `node-fetch`, `axios`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API that includes request matching, timeouts, retries, and so forth.

This library is a strip-to-bone implementation that provides as little abstraction as possible to execute arbitrary logic upon any request in NodeJS. It's primarily designed as an underlying component for a high-level API mocking solutions.

### Why XMLHttpRequest?

Although NodeJS has no `XMLHttpRequest` implementation, this library covers it for the sake of processes that still run in NodeJS, but emulate a browser-like environment (i.e. `jsdom` when running tests in Jest).

## What this library does

This library monkey-patches the following native functions:

- `http.request`/`http.get`
- `https.request`/`https.get`
- `XMLHttpRequest`

Once patched, it provides an interface to execute an arbitrary logic upon any outgoing request using a request middleware function.

- Bypasses all requests by default, so your network channel is not affected.
- Handles an abstract response object returned from the request middleware as an actual response for the occurred request (taking into account the difference in constructing a response for different clients).

## What this library doesn't do

- Does not provide any request matching logic.
- Does not decide how to handle requests.
- Does not run in a browser (although supports `jsdom`).

## Getting started

### Install

```bash
npm install node-request-interceptor
```

### Use

```js
import { RequestInterceptor } from 'node-request-interceptor'

const interceptor = new RequestInterceptor()

// Provide a request middleware function that accepts an intercepted request
// and may return an optional abstract response.
interceptor.use((req) => {
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

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
