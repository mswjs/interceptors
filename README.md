[![Latest version](https://img.shields.io/npm/v/@mswjs/interceptors.svg)](https://www.npmjs.com/package/@mswjs/interceptors)

# `@mswjs/interceptors`

Low-level HTTP/HTTPS/XHR/fetch request interception library.

**Intercepts any requests issued by:**

- `http.get`/`http.request`
- `https.get`/`https.request`
- `XMLHttpRequest`
- `fetch`
- Any third-party libraries that use the modules above (i.e. `request`, `node-fetch`, `supertest`, etc.)

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, giving you a high-level API that includes request matching, timeouts, retries, and so forth.

This library is a strip-to-bone implementation that provides as little abstraction as possible to execute arbitrary logic upon any request. It's primarily designed as an underlying component for high-level API mocking solutions such as [Mock Service Worker](https://github.com/mswjs/msw).

### How is this library different?

A traditional API mocking implementation in Node.js looks roughly like this:

```js
import http from 'http'

function applyMock() {
  // Store the original request module.
  const originalHttpRequest = http.request

  // Rewrite the request module entirely.
  http.request = function (...args) {
    // Decide whether to handle this request before
    // the actual request happens.
    if (shouldMock(args)) {
      // If so, never create a request, respond to it
      // using the mocked response from this blackbox.
      return coerceToResponse.bind(this, mock)
    }

    // Otherwise, construct the original request
    // and perform it as-is (receives the original response).
    return originalHttpRequest(...args)
  }
}
```

This library deviates from such implementation and uses _class extensions_ instead of module rewrites. Such deviation is necessary because, unlike other solutions that include request matching and can determine whether to mock requests _before_ they actually happen, this library is not opinionated about the mocked/bypassed nature of the requests. Instead, it _intercepts all requests_ and delegates the decision of mocking to the end consumer.

```js
class NodeClientRequest extends ClientRequest {
  async end(...args) {
    // Check if there's a mocked response for this request.
    // You control this in the "resolver" function.
    const mockedResponse = await resolver(isomorphicRequest)

    // If there is a mocked response, use it to respond to this
    // request, finalizing it afterward as if it received that
    // response from the actual server it connected to.
    if (mockedResponse) {
      this.respondWith(mockedResponse)
      this.finish()
      return
    }

    // Otherwise, perform the original "ClientRequest.prototype.end" call.
    return super.end(...args)
  }
}
```

By extending the native modules, this library actually constructs requests as soon as they are constructed by the consumer. This enables all the request input validation and transformations done natively by Node.js—something that traditional solutions simply cannot do (they replace `http.ClientRequest` entirely). The class extension allows to fully utilize Node.js internals instead of polyfilling them, which results in more resilient mocks.

## What this library does

This library extends (or patches, where applicable) the following native modules:

- `http.get`/`http.request`
- `https.get`/`https.request`
- `XMLHttpRequest`
- `fetch`

Once extended, it intercepts and normalizes all requests to the _isomorphic request instances_. The isomorphic request is an abstract representation of the request coming from different sources (`ClientRequest`, `XMLHttpRequest`, `window.Request`, etc.) that allows us to handle such requests in the same, unified manner.

You can respond to an isomorphic request using an _isomorphic response_. In a similar way, the isomorphic response is a representation of the response to use for different requests. Responding to requests differs substantially when using modules like `http` or `XMLHttpRequest`. This library takes the responsibility for coercing isomorphic responses into appropriate responses depending on the request module automatically.

## What this library doesn't do

- Does **not** provide any request matching logic;
- Does **not** decide how to handle requests.

## Getting started

```bash
npm install @mswjs/interceptors
```

## API

### `createInterceptor(options: CreateInterceptorOptions)`

Enables request interception in the current process.

```js
import { createInterceptor } from '@mswjs/interceptors'
import nodeInterceptors from '@mswjs/interceptors/lib/presets/node'

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(request, ref) {
    // Optionally, return a mocked response.
  },
})
```

> Using the `/presets/node` interceptors preset is the recommended way to ensure all requests get intercepted, regardless of their origin.

### `createRemoteInterceptor(options: CreateRemoteInterceptorOptions)`

Enables request interception in the current process while delegating the response resolution logic to the _parent process_. **Requires the current process to be a child process**. Requires the parent process to establish a resolver by calling the `createRemoteResolver` function.

```js
import { createRemoteInterceptor } from '@mswjs/interceptors'

const interceptor = createRemoteInterceptor({
  modules: nodeInterceptors,
})

interceptor.apply()

process.on('disconnect', () => {
  interceptor.restore()
})
```

### `createRemoteResolver(options: CreateRemoteResolverOptions)`

Resolves an intercepted request in the given child `process`. Requires for that child process to enable request interception by calling the `createRemoteInterceptor` function.

```js
import { spawn } from 'child_process'
import { createRemoteResolver } from '@mswjs/interceptors'

const appProcess = spawn('node', ['app.js'], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
})

createRemoteResolver({
  process: appProcess,
  resolver(request) {
    // Optionally, return a mocked response
    // for a request that occurred in the "appProcess".
  },
})
```

### Interceptors

This library utilizes a concept of _interceptors_–functions that extend request modules, handle mocked responses, and restore themselves when done.

**Available interceptors:**

- `/interceptors/ClientRequest`
- `/interceptors/XMLHttpRequest`
- `/interceptors/fetch`

To use a single, or multiple interceptors, import and provide them to the `createInterceptor` function.

```js
import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

// This `interceptor` instance would handle only XMLHttpRequest,
// ignoring requests issued via `http`/`https` modules.
const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
})
```

> Interceptors are crucial in leveraging environment-specific module overrides. Certain environments (i.e. React Native) do not have access to native Node.js modules (like `http`). Importing such modules throws an exception and should be avoided.

### Methods

#### `.apply(): void`

Applies module patches and enables interception of the requests.

```js
interceptor.apply()
```

#### `.on(event, listener): boolean`

Adds an event listener to one of the following supported events:

- `request`, signals when a new request happens;
- `response`, signals when a response was sent.

```js
interceptor.on('request', (request) => {
  console.log('[%s] %s', request.method, request.url.toString())
})
```

#### `.restore(): void`

Restores all extensions and stops the interception of future requests.

```js
interceptor.restore()
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
