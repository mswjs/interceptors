# `node-request-interceptor`

Low-level HTTP/HTTPS request interception library for NodeJS.

**Supports interception of requests performed using:**

- `http.request()`/`https.request()`
- `http.get()`/`https.get()`
- `fetch()`
- Any third-party implementations that utilize the above (i.e. `node-fetch`, `axios`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API for matching requests.

This library allows you to execute arbitrary logic whenever an HTTP/HTTPS request happens. Through that logic you can set up logging or mocking, depending on your requirements.

## What this library does

This library replaces the following native functions with their compatible augmented implementations:

- `http.request`/`https.request`
- `http.get`/`https.get`

Upon replacing, it provides an interface to listen to outgoing requests regardless of their origin.

- Performs all requests as-is, unless a mocked response is returned in the interceptor.

## What this library doesn't do

- Does not provide any request matching logic.
- Does not decide how to handle a request.
- Does not run in a browser environment.

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

The following libraries were used as inspiration to write this low-level API:

- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
