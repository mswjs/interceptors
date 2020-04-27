# `node-request-interceptor`

Low-level HTTP/HTTPS request interception library for NodeJS.

**Supports interception of requests performed using:**

- `http.request()`/`https.request()`
- `http.get()`/`https.get()`
- `XMLRequest`
- `fetch()`
- Any third-party implementations that utilize the above (i.e. `node-fetch`, `axios`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API for matching requests.

This library allows you to execute arbitrary logic whenever an HTTP/HTTPS request happens. Through that logic you can set up logging or mocking, depending on your requirements.

## How does this work?

This library operates by replacing the following native functions with their compatible augmented implementations:

- `http.request`/`https.request`
- `http.get`/`https.get`
- `XMLHttpRequest`

## Getting started

### Install

```bash
npm install node-request-interceptor
```

### Use

```js
import { RequestInterceptor } from 'node-request-interceptor'

const interceptor = new RequestInterceptor()

interceptor.on('request', (req) => {
  // Execute arbitrary logic whenever any request happens.
  // `req` contains information about the intercepted request,
  // regardless of its origins (http/https/xhr).
  if (req.url === 'https://non-existing.url') {
    // Return an abstract mocked response that is later coerced
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

- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
