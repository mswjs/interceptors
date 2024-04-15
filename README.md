[![Latest version](https://img.shields.io/npm/v/@mswjs/interceptors.svg)](https://www.npmjs.com/package/@mswjs/interceptors)

# `@mswjs/interceptors`

Low-level network interception library.

This library supports intercepting the following protocols:

- HTTP (via the `http` module, `XMLHttpRequest`, or `globalThis.fetch`);
- [WebSocket](#websocket-interception) (the `WebSocket` class in Undici and in the browser).

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
    const mockedResponse = await resolver(request)

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

Once extended, it intercepts and normalizes all requests to the Fetch API `Request` instances. This way, no matter the request source (`http.ClientRequest`, `XMLHttpRequest`, `window.Request`, etc), you always get a specification-compliant request instance to work with.

You can respond to the intercepted request by constructing a Fetch API Response instance. Instead of designing custom abstractions, this library respects the Fetch API specification and takes the responsibility to coerce a single response declaration to the appropriate response formats based on the request-issuing modules (like `http.OutgoingMessage` to respond to `http.ClientRequest`, or updating `XMLHttpRequest` response-related properties).

## What this library doesn't do

- Does **not** provide any request matching logic;
- Does **not** decide how to handle requests.

## Getting started

```bash
npm install @mswjs/interceptors
```

## Interceptors

To use this library you need to choose one or multiple interceptors to apply. There are different interceptors exported by this library to spy on respective request-issuing modules:

- `ClientRequestInterceptor` to spy on `http.ClientRequest` (`http.get`/`http.request`);
- `XMLHttpRequestInterceptor` to spy on `XMLHttpRequest`;
- `FetchInterceptor` to spy on `fetch`.

Use an interceptor by constructing it and attaching request/response listeners:

```js
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

// Enable the interception of requests.
interceptor.apply()

// Listen to any "http.ClientRequest" being dispatched,
// and log its method and full URL.
interceptor.on('request', ({ request, requestId }) => {
  console.log(request.method, request.url)
})

// Listen to any responses sent to "http.ClientRequest".
// Note that this listener is read-only and cannot affect responses.
interceptor.on(
  'response',
  ({ response, isMockedResponse, request, requestId }) => {
    console.log('response to %s %s was:', request.method, request.url, response)
  }
)
```

All HTTP request interceptors implement the same events:

- `request`, emitted whenever a request has been dispatched;
- `response`, emitted whenever any request receives a response.

### Using multiple interceptors

You can combine multiple interceptors to capture requests from different request-issuing modules at once.

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
  ],
})

interceptor.apply()

// This "request" listener will be called on both
// "http.ClientRequest" and "XMLHttpRequest" being dispatched.
interceptor.on('request', listener)
```

> Note that you can use [pre-defined presets](#presets) that cover all the request sources for a given environment type.

## Presets

When using [`BatchInterceptor`](#batchinterceptor), you can provide a pre-defined preset to its "interceptors" option to capture all request for that environment.

### Node.js preset

This preset combines `ClientRequestInterceptor`, `XMLHttpRequestInterceptor` and is meant to be used in Node.js.

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import nodeInterceptors from '@mswjs/interceptors/presets/node'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: nodeInterceptors,
})

interceptor.apply()

interceptor.on('request', listener)
```

### Browser preset

This preset combines `XMLHttpRequestInterceptor` and `FetchInterceptor` and is meant to be used in a browser.

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import browserInterceptors from '@mswjs/interceptors/presets/browser'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: browserInterceptors,
})

interceptor.on('request', listener)
```

## Introspecting requests

All HTTP request interceptors emit a "request" event. In the listener to this event, they expose a `request` reference, which is a [Fetch API Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) instance.

> There are many ways to describe a request in Node.js but this library coerces different request definitions to a single specification-compliant `Request` instance to make the handling consistent.

```js
interceptor.on('request', ({ request, requestId }) => {
  console.log(request.method, request.url)
})
```

Since the exposed `request` instance implements the Fetch API specification, you can operate with it just as you do with the regular browser request. For example, this is how you would read the request body as JSON:

```js
interceptor.on('request', async ({ request, requestId }) => {
  const json = await request.clone().json()
})
```

> **Do not forget to clone the request before reading its body!**

## Modifying requests

Request representations are readonly. You can, however, mutate the intercepted request's headers in the "request" listener:

```js
interceptor.on('request', ({ request }) => {
  request.headers.set('X-My-Header', 'true')
})
```

> This restriction is done so that the library wouldn't have to unnecessarily synchronize the actual request instance and its Fetch API request representation. As of now, this library is not meant to be used as a full-scale proxy.

## Mocking responses

Although this library can be used purely for request introspection purposes, you can also affect request resolution by responding to any intercepted request within the "request" event.

Use the `request.respondWith()` method to respond to a request with a mocked response:

```js
interceptor.on('request', ({ request, requestId }) => {
  request.respondWith(
    new Response(
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      }),
      {
        status: 201,
        statusText: 'Created',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  )
})
```

> We use Fetch API `Response` class as the middle-ground for mocked response definition. This library then coerces the response instance to the appropriate response format (e.g. to `http.OutgoingMessage` in the case of `http.ClientRequest`).

**The `Response` class is built-in in since Node.js 18. Use a Fetch API-compatible polyfill, like `node-fetch`, for older versions of Node.js.`**

Note that a single request _can only be handled once_. You may want to introduce conditional logic, like routing, in your request listener but it's generally advised to use a higher-level library like [Mock Service Worker](https://github.com/mswjs/msw) that does request matching for you.

Requests must be responded to within the same tick as the request listener. This means you cannot respond to a request using `setTimeout`, as this will delegate the callback to the next tick. If you wish to introduce asynchronous side-effects in the listener, consider making it an `async` function, awaiting any side-effects you need.

```js
// Respond to all requests with a 500 response
// delayed by 500ms.
interceptor.on('request', async ({ request, requestId }) => {
  await sleep(500)
  request.respondWith(new Response(null, { status: 500 }))
})
```

## Observing responses

You can use the "response" event to transparently observe any incoming responses in your Node.js process.

```js
interceptor.on(
  'response',
  ({ response, isMockedResponse, request, requestId }) => {
    // react to the incoming response...
  }
)
```

> Note that the `isMockedResponse` property will only be set to `true` if you resolved this request in the "request" event listener using the `request.respondWith()` method and providing a mocked `Response` instance.

## WebSocket interception

You can intercept a WebSocket communication using the `WebSocketInterceptor` class.

> [!IMPORTANT]
> This library only supports intercepting WebSocket connections created using the global WHATWG `WebSocket` class. Third-party transports, such as HTTP/XHR polling, are not supported by design due to their contrived nature.

```js
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()
```

Unlike the HTTP-based interceptors that share the same `request`/`response` events, the WebSocket interceptor only emits the `connection` event and let's you handle the incoming/outgoing events in its listener.

### Important defaults

1. Intercepted WebSocket connections are _not opened_. To open the actual WebSocket connection, call [`server.connect()`](#connect) in the interceptor.
1. Once connected to the actual server, the outgoing client events are _forwarded to that server by default_. If you wish to prevent a client message from reaching the server, call `event.preventDefault()` for that client message event.
1. Once connected to the actual server, the incoming server events are _forwarded to the client by default_. If you wish to prevent a server message from reaching the client, call `event.preventDefault()` for the server message event.
1. Once connected to the actual server, the `close` event received from that server is _forwarded to the client by default_. If you wish to prevent that, call `event.preventDefault()` for that close event of the server.

### WebSocket connection

Whenever a WebSocket instance is constructed, the `connection` event is emitted on the WebSocket interceptor.

```js
intereceptor.on('connection', ({ client }) => {
  console.log(client.url)
})
```

The `connection` event exposes the following arguments:

| Name     | Type                                                      | Description                                                      |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `client` | [`WebSocketClientConnection`](#websocketclientconnection) | An object representing a connected WebSocket client instance.    |
| `server` | [`WebSocketServerConnection`](#websocketserverconnection) | An object representing the original WebSocket server connection. |

### `WebSocketClientConnection`

#### `.addEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Adds an event listener to the given event type of the WebSocket client.

```ts
interface WebSocketServerConnectionEventMap {
  // Dispatched when the WebSocket client sends data.
  message: (this: WebSocket, event: MessageEvent<WebSocketData>) => void

  // Dispatched when the WebSocket client is closed.
  close: (this: WebSocket, event: CloseEvent) => void
}
```

```js
client.addEventListener('message', (event) => {
  console.log('outgoing:', event.data)
})
```

#### `.removeEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Removes the listener for the given event type.

#### `.send(data)`

- `data`, `string | Blob | ArrayBuffer`

Sends the data to the intercepted WebSocket client.

```js
client.send('text')
client.send(new Blob(['blob']))
client.send(new TextEncoder().encode('array buffer'))
```

#### `.close(code, reason)`

- `code`, close [status code](https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1).
- `reason`, [close reason](https://www.rfc-editor.org/rfc/rfc6455#section-7.1.6).

Closes the client connection. Unlike the regular `WebSocket.prototype.close()`, the `client.close()` method can accept a non-configurable status codes, such as 1001, 1003, etc.

```js
// Gracefully close the connection with the
// intercepted WebSocket client.
client.close()
```

```js
// Terminate the connection by emulating
// the server unable to process the received data.
client.close(1003)
```

### `WebSocketServerConnection`

#### `.connect()`

Establishes the connection to the original WebSocket server. Connection cannot be awaited. Any data sent via `server.send()` while connecting is buffered and flushed once the connection is open.

#### `.addEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Adds an event listener to the given event type of the WebSocket server.

```ts
interface WebSocketServerConnectionEventMap {
  // Dispatched when the server connection is open.
  open: (this: WebSocket, event: Event) => void

  // Dispatched when the server sends data to the client.
  message: (this: WebSocket, event: MessageEvent<WebSocketData>) => void

  // Dispatched when the server connection closes.
  close: (this: WebSocket, event: CloseEvent) => void
}
```

```js
server.addEventListener('message', (event) => {
  console.log('incoming:', event.data)
})
```

#### `.removeEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Removes the listener for the given event type.

#### `.send(data)`

- `data`, `string | Blob | ArrayBuffer`

Sends the data to the original WebSocket server. Useful in a combination with the client-sent events forwarding:

```js
client.addEventListener('message', (event) => {
  server.send(event.data)
})
```

#### `.close()`

Closes the connection with the original WebSocket server. Unlike `client.close()`, closing the server connection does not accept any arguments and always asumes a graceful closure. Sending data via `server.send()` after the connection has been closed will have no effect.

## API

### `Interceptor`

A generic class implemented by all interceptors. You do not interact with this class directly.

```ts
class Interceptor {
  // Applies the interceptor, enabling the interception of requests
  // in the current process.
  apply(): void

  // Listens to the public interceptor events.
  // For HTTP requests, these are "request' and "response" events.
  on(event, listener): void

  // Cleans up any side-effects introduced by the interceptor
  // and disables the interception of requests.
  dispose(): void
}
```

**For public consumption, use [interceptors](#interceptors) instead**.

### `BatchInterceptor`

Applies multiple request interceptors at the same time.

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import nodeInterceptors from '@mswjs/interceptors/presets/node'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: nodeInterceptors,
})

interceptor.apply()

interceptor.on('request', ({ request, requestId }) => {
  // Inspect the intercepted "request".
  // Optionally, return a mocked response.
})
```

> Using the `/presets/node` interceptors preset is the recommended way to ensure all requests get intercepted, regardless of their origin.

### `RemoteHttpInterceptor`

Enables request interception in the current process while delegating the response resolution logic to the _parent process_. **Requires the current process to be a child process**. Requires the parent process to establish a resolver by calling the `createRemoteResolver` function.

```js
// child.js
import { RemoteHttpInterceptor } from '@mswjs/interceptors/RemoteHttpInterceptor'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'

const interceptor = new RemoteHttpInterceptor({
  // Alternatively, you can use presets.
  interceptors: [new ClientRequestInterceptor()],
})

interceptor.apply()

process.on('disconnect', () => {
  interceptor.dispose()
})
```

You can still listen to and handle any requests in the child process via the `request` event listener. Keep in mind that a single request can only be responded to once.

### `RemoteHttpResolver`

Resolves an intercepted request in the given child `process`. Requires for that child process to enable request interception by calling the `createRemoteInterceptor` function.

```js
// parent.js
import { spawn } from 'child_process'
import { RemoteHttpResolver } from '@mswjs/interceptors/RemoteHttpInterceptor'

const appProcess = spawn('node', ['app.js'], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
})

const resolver = new RemoteHttpResolver({
  process: appProcess,
})

resolver.on('request', ({ request, requestId }) => {
  // Optionally, return a mocked response
  // for a request that occurred in the "appProcess".
})
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
