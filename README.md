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

### `createInterceptor(options: CreateInterceptorOptions)`

```js
import { createInterceptor } from 'node-request-interceptor'
import nodeInterceptors from 'node-request-interceptor/lib/presets/node'

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(request, ref) {
    // Optionally, return a mocked response.
  },
})
```

> Using the `/presets/node` interceptors preset is the recommended way to ensure all requests get intercepted, regardless of their origin.

### Interceptors

This library utilizes a concept of _interceptors_–functions that patch necessary modules, handle mocked responses, and restore patched modules.

**List of interceptors:**

- `/interceptors/ClientRequest`
- `/interceptors/XMLHttpRequest`

To use a single, or multiple interceptors, import and provide them to the `RequestInterceptor` constructor.

```js
import { createInterceptor } from 'node-request-interceptor'
import { interceptXMLHttpRequest } from 'node-request-interceptor/lib/interceptors/XMLHttpRequest'

// This `interceptor` instance would handle only XMLHttpRequest,
// ignoring requests issued via `http`/`https` modules.
const interceptor = new createInterceptor({
  modules: [interceptXMLHttpRequest],
})
```

> Interceptors are crucial in leveraging environment-specific module overrides. Certain environments (i.e. React Native) do not have access to native NodeJS modules (like `http`). Importing such modules raises an exception, and must be avoided.

### Methods

#### `.apply(): void`

Applies module patches and enabled interception of the requests.

```js
interceptor.apply()
```

#### `.on(event, listener): boolean`

Adds an event listener to one of the following supported events:

- `request`, whenever a new request happens.
- `response`, whenever a request library responds to a request.

```js
interceptor.on('request', (request) => {
  console.log('[%s] %s', request.method, request.url.toString())
})
```

#### `.restore(): void`

Restores all patched modules and stops the interception of any future requests.

```js
interceptor.restore()
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
