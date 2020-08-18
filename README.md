[![Latest version](https://img.shields.io/npm/v/node-request-interceptor.svg)](https://www.npmjs.com/package/node-request-interceptor)
[![Build status](https://img.shields.io/circleci/project/github/mswjs/node-request-interceptor/master.svg)](https://app.circleci.com/pipelines/github/mswjs/node-request-interceptor)

# `node-request-interceptor`

Low-level HTTP/HTTPS/XHR request interception library for NodeJS.

**Intercepts any requests issued by:**

- `http.get`/`http.request`
- `https.get`/`https.request`
- `fetch`
- `XMLHttpRequest`
- Any third-party libraries that utilize the modules above (i.e. `request`, `node-fetch`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API that includes request matching, timeouts, retries, and so forth.

This library is a strip-to-bone implementation that provides as little abstraction as possible to execute arbitrary logic upon any request in NodeJS. It's primarily designed as an underlying component for a high-level API mocking solutions.

### How is this library different?

As interception is often combined with request route matching, some libraries can determine whether a request should be mocked _before_ it actually happens. This approach is not suitable for this library, as it rather _intercepts all requests_ and then let's you decide which ones should be mocked. This affects the level at which interception happens, and also the way mocked/original response is constructed, in comparison to other solutions.

### Why XMLHttpRequest?

Although NodeJS has no `XMLHttpRequest` implementation, this library covers it for the sake of processes that still run in NodeJS, but emulate a browser-like environment (i.e. `jsdom` when running tests in Jest).

## What this library does

This library monkey-patches the following native modules:

- `http.get`/`http.request`
- `https.get`/`https.request`
- `XMLHttpRequest`

Once patched, it provides an interface to execute an arbitrary logic upon any outgoing request using a request middleware function.

- Bypasses all requests by default, so your network channel is not affected.
- Handles an abstract response object returned from the request middleware as an actual response for the occurred request (taking into account the difference in constructing a response for different clients).

## What this library doesn't do

- Does **not** provide any request matching logic.
- Does **not** decide how to handle requests.
- Does **not** run in a browser (although supports `jsdom`).

## Getting started

```bash
npm install node-request-interceptor
```

## API

### `RequestInterceptor(interceptors: Interceptor[])`

```js
import { RequestInterceptor } from 'node-request-interceptor'
import withDefaultInterceptors from 'node-request-interceptor/presets/default'

const interceptor = new RequestInterceptor(withDefaultInterceptors)
```

> Using the `/presets/default` interceptors preset is the recommended way to ensure all requests get intercepted, regardless of their origin.

### Interceptors

This library utilizes a concept of an _interceptor_–a module that performs necessary patching, handles a mocked response, and restores patched instances.

**The list of interceptors:**

- `/interceptors/ClientRequest`
- `/interceptors/XMLHttpRequest`

To use one, or multiple interceptors, import and provide them to the `RequestInterceptor` constructor.

```js
import { RequestInterceptors } from 'node-request-interceptor'
import { interceptXMLHttpRequest } from 'node-request-interceptor/interceptors/XMLHttpRequest'

// This `interceptor` instance would handle only XMLHttpRequest,
// ignoring requests issued via `http`/`https` modules.
const interceptor = new RequestInterceptors([interceptXMLHttpRequest])
```

> Interceptors are crucial in leveraging environment-specific module overrides. Certain environments (i.e. React Native) do not have access to native NodeJS modules (like `http`). Importing such modules raises an exception, and must be avoided.

### Methods

#### `.use(middleware: (req: InterceptedRequest, ref: IncomingMessage | XMLHttpRequest) => MockedResponse): void`

Applies a given middleware function to an intercepted request. May return a [`MockedResponse`](#MockedResponse) object that is going to be used to respond to an intercepted request.

##### Requests monitoring

```js
interceptor.use((req) => {
  // Will print to stdout any outgoing requests
  // without affecting their responses
  console.log('%s %s', req.method, req.url.href)
})
```

##### Response mocking

When a request middleware returns a [`MockedResponse`](#MockedResponse) object, it will be returned as the response to the intercepted request. This library automatically creates a proper response instance according to the request issuing module (`http`/`XMLHttpRequest`).

```js
interceptor.use((req) => {
  if (['https://google.com'].includes(req.url.origin)) {
    // Will return a mocked response for any request
    // that is issued from the "https://google.com" origin.
    return {
      status: 301,
      headers: {
        'x-powered-by': 'node-request-interceptor',
      },
      body: JSON.stringify({
        message: 'Hey, I am a mocked response',
      }),
    }
  }
})
```

#### `.restore(): void`

Restores all patched modules and stops the interception of any future requests.

```js
interceptor.restore()
```

---

### `InterceptedRequest`

```ts
interface InterceptedRequest {
  url: URL
  method: string
  headers?: http.OutgoingHttpHeaders
  body?: string
}
```

---

### `MockedResponse`

Whenever a `MockedResponse` object is returned from the request middleware function, it's being used to constructs a relevant response for the intercepted request.

```ts
interface MockedResponse {
  status?: number
  statusText?: string
  headers?: Record<string, string | string[]>
  body?: string
}
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
