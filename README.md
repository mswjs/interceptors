# `@mswjs/interceptors`

Low-level network interception library for Node.js.

Use this library if you wish to intercept any of the below:

- Raw TCP and TLS socket connections (`net.connect()`, `tls.connect()`);
- HTTP requests regardless of the request client (e.g. `http.request()`, `axios()`, etc);
- Fetch requests (both global `fetch()` and custom fetch implementations like `undici()`);
- WebSocket connections (global `WebSocket` constructor).

## Motivation

There has been a few attempts at the network interception in Node.js throughout its existence. Around 2018, those efforts have settled on patching `http.request()` and `http.ClientRequest`, if not resorting to far worse practices like patching request clients directly. These algorithms turned network requests into black boxes that, effectively, short-circuited the network code at the interception point.

Consider how Node.js orchestrates an average HTTP request:

```
1. Third-party request client (axios/got/etc);
---- node:http / node:https ----
2. http.request() (node:http/node:https);
3. new http.ClientRequest();
---- node:net / node:tls ----
4. net.connect() / tls.connect();
5. new net.Socket();
6. socket.connect();
---- native bindings ----
7. TCPWrap / TLSWrap;
---- C++ network code ---
8. [TOO_COMPLEX_TO_FATHOM];
```

You can see how intercepting requests at the `http.request()` level (2) is rather limiting as, typically, nothing executes past the interception point. As a result, whenever such interception is introduced, it significantly deviates your system from how it normally behaves otherwise.

So I decided to build a network interception algorithm that would have no such limitations, would execute as much of the Node.js network code as possible, and actually establish network connections (yes, even when mocking requests to non-existing hosts). On top of that, I want that algorithm to be fully available for anybody who wishes to build their own API mocking library.

### What makes Interceptors different?

Interceptors (the library you're reading about) implements the network interception on the TCP/TLS handle level (point 7 on the graph above). In the simplest of terms, it's the lowest possible level to spy on outgoing traffic without having to recompile Node.js on your machine.

In more technical terms, the algorithm combines multiple entry points along the network graph, each playing its role in the interception:

- Spies on the network on the socket level by intercepting `Socket.prototype.connect`, `net.connect()`, and `tls.connect()`;
- Stubs `TCPWrap`/`TLSWrap` until the connection is either claimed or passed through;
- Wraps socket-level interception in higher-level interceptors, like `HttpRequestInterceptor`, which pipe outgoing and incoming socket packets through respective parsers;
- Wraps higher-level interceptors in request client interceptors that leverage `AsyncLocalStorage` to annotate request initiators without intercepting any traffic themselves (a socket connection are unaware of any protocols, let alone request clients that triggered the connection);

Intercepting the network this low on the network graph means executing as much of Node.js network code as physically possible even when mocking requests. This minimizes the deviations introduced by the said interception and yields a more compliant mocking experience.

## When to use Interceptors?

Interceptors is **not** an API mocking library. It's a low-level network interception library. Mocking the network is just a subset of what you can do with it.

As a rule of thumb, if you're uncertain whether you need Interceptors, you likely don't. Interceptors exist primarily to help other developers implement their own higher-level API mocking libraries, like [Nock](https://github.com/nock/nock) or [Mock Service Worker](https://mswjs.io), with the goal of unifying the network interception algorithm for richer features and better runtime compliance.

## Getting started

```bash
npm i @mswjs/interceptors
```

### Debugging

Enable default interceptor logs with `debug` namespaces:

```bash
DEBUG='interceptors:*' node app.js
```

Default logs cover interceptor lifecycle, requests, and request
resolution. Add verbose logs for socket packets, event forwarding, and other
internals:

```bash
DEBUG='interceptors:*' DEBUG_LEVEL=verbose node app.js
```

Scope either level to an interceptor using its lowercase kebab-case name, such
as `interceptors:fetch`, `interceptors:xhr`, `interceptors:client-request`, or
`interceptors:websocket`. In browsers, assign the same value to
`localStorage.debug` and set `localStorage.debugLevel` to `verbose` for verbose
logs. Each namespace has a stable color.

## Interceptors

To use this library you need to choose one or multiple interceptors to apply. There are different interceptors exported by this library to spy on respective request-issuing modules:

- [`SocketInterceptor`](#socketinterceptor) to spy on any socket connections in Node.js;
- [`HttpRequestInterceptor`](#httprequestinterceptor) to spy on any HTTP requests in Node.js;
- [`ClientRequestInterceptor`](#clientrequestinterceptor) to spy on `http.ClientRequest` (`http.get`/`http.request`);
- [`XMLHttpRequestInterceptor`](#xmlhttprequestinterceptor) to spy on `XMLHttpRequest`;
- [`FetchInterceptor`](#fetchinterceptor) to spy on the global `fetch`;
- [`WebSocketInterceptor`](#websocketinterceptor) to spy on WebSocket connections.

You can combine multiple interceptors using [`BatchInterceptor`](#batchinterceptor).

### `SocketInterceptor`

The lowest-level interceptor in this library. It intercepts _every outgoing TCP and TLS connection_ in Node.js at the `net.Socket` level, no matter which module or third-party package creates it. It is the foundation the HTTP interceptors below are built upon.

```js
import { SocketInterceptor } from '@mswjs/interceptors/net'

const interceptor = new SocketInterceptor()

interceptor.on('connection', ({ socket, connectionOptions, controller }) => {
  if (connectionOptions.host === 'example.com') {
    controller.claim()

    socket.on('data', (chunk) => {
      socket.write(anotherChunk)
    })
  }
})

interceptor.apply()
```

> The exposed `socket` instance is _mirrored_ so you can think of the connection listener as a server-side handler. It emits `data` when the client _writes_ to it and writing to it will emit `data` events on the intercepted socket.

The `connection` event is emitted whenever a socket connection is open in this process. Use its listener to inspect and it decide whether you want to claim it for manual management (`controller.claim()`) or let it pass through (`controller.passthrough()`). Until you decide either, the connection will remain in the pending state.

### `HttpRequestInterceptor`

Intercepts **all HTTP requests in Node.js, regardless of the client** that issued them. Because the interception happens at the socket level, this includes `http`/`https` modules, the global `fetch`, direct Undici usage (`fetch`, `request`, pools, agents), and any third-party HTTP client built on top of them (Axios, Got, node-fetch, superagent, etc).

```js
import { HttpRequestInterceptor } from '@mswjs/interceptors/http'

const interceptor = new HttpRequestInterceptor()
interceptor.apply()
```

#### Observing requests

Add a listener to the `request` event to observe outgoing HTTP requests. The listener exposes the intercepted request as a [Fetch API `Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) instance.

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

> Make sure to clone the request before reading its body.

##### Request initiator

The `request` event exposes an `initiator` property that references the object that issued the intercepted request:

- an `http.ClientRequest` instance for requests made via the `http`/`https` modules;
- a Fetch API `Request` instance for requests made via the global `fetch`;
- an `XMLHttpRequest` instance for requests made via `XMLHttpRequest`;
- a `net.Socket` instance for requests that cannot be attributed to a known client (e.g. raw socket connections or direct Undici usage).

> Attributing a request to its client requires the corresponding client-level interceptor ([`ClientRequestInterceptor`](#clientrequestinterceptor), [`FetchInterceptor`](#fetchinterceptor), or [`XMLHttpRequestInterceptor`](#xmlhttprequestinterceptor)) to be applied alongside `HttpRequestInterceptor`. With `HttpRequestInterceptor` alone, the initiator is the underlying `net.Socket`.

The initiator is typed as `unknown`. Narrow it down with `instanceof` to access the client-specific state, e.g. to tell the requests from different clients apart:

```js
import http from 'node:http'

interceptor.on('request', ({ request, initiator }) => {
  if (initiator instanceof http.ClientRequest) {
    // This request was made via "http.request()"/"http.get()".
    console.log(initiator.getHeaders())
  }

  if (initiator instanceof Request) {
    // This request was made via the global "fetch".
  }
})
```

#### Modifying outgoing requests

Request representations are readonly. You can, however, mutate the intercepted request's headers in the `request` listener. The modified headers are sent to the actual server if the request is performed as-is:

```js
interceptor.on('request', ({ request }) => {
  request.headers.set('x-my-header', 'true')
})
```

> This restriction is done so that the library wouldn't have to unnecessarily synchronize the actual request instance and its Fetch API request representation. As of now, this library is not meant to be used as a full-scale proxy.

#### Mocking responses

Although this library can be used purely for observing the network, you can also affect request resolution by responding to any intercepted request within the `request` event.

Access the `controller` object from the request event listener arguments and call its `controller.respondWith()` method, providing it with a mocked `Response` instance:

```js
interceptor.on('request', ({ request, controller }) => {
  controller.respondWith(
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

Note that a single request _can only be handled once_. You may want to introduce conditional logic, like routing, in your request listener but it's generally advised to use a higher-level library like [Mock Service Worker](https://github.com/mswjs/msw) that does request matching for you.

Requests must be responded to within the same tick as the request listener. This means you cannot respond to a request using `setTimeout`, as this will delegate the callback to the next tick. If you wish to introduce asynchronous side-effects in the listener, consider making it an `async` function, awaiting any side-effects you need.

```js
import { setTimeout } from 'node:timers/promises'

// Respond to all requests with a 500 response
// delayed by 500ms.
interceptor.on('request', async ({ controller }) => {
  await setTimeout(500)
  controller.respondWith(new Response(null, { status: 500 }))
})
```

##### Mocking response errors

You can provide an instance of `Response.error()` to error the pending request.

```js
interceptor.on('request', ({ request, controller }) => {
  controller.respondWith(Response.error())
})
```

This will automatically translate to the appropriate request error based on the request client that issued the request. **Use this method to produce a generic network error**.

> Note that the standard `Response.error()` API does not accept an error message.

##### Mocking errors

Use the `controller.errorWith()` method to error the request.

```js
interceptor.on('request', ({ request, controller }) => {
  controller.errorWith(new Error('reason'))
})
```

Unlike responding with `Response.error()`, you can provide an exact error reason to use to `.errorWith()`. **Use this method to error the request**.

> Note that it is up to the request client to respect your custom error. Some clients, like `ClientRequest` will use the provided error message, while others, like `fetch`, will produce a generic `TypeError: failed to fetch` responses. Interceptors will try to preserve the original error in the `cause` property of such generic errors.

##### Handling exceptions

By default, all unhandled exceptions thrown within the `request` listener are coerced to 500 error responses, emulating those exceptions occurring on the actual server. You can listen to the exceptions by adding the `unhandledException` listener to the interceptor:

```js
interceptor.on(
  'unhandledException',
  ({ error, request, requestId, controller }) => {
    console.log(error)
  }
)
```

To opt out from the default coercion of unhandled exceptions to server responses, you need to either:

1. Respond to the request with [a mocked response](#mocking-responses) (including error responses);
1. Propagate the error up by throwing it explicitly in the `unhandledException` listener.

Here's an example of propagating the unhandled exception up:

```js
interceptor.on('unhandledException', ({ error }) => {
  // Now, any unhandled exception will NOT be coerced to a 500 error response,
  // and instead will be thrown during the process execution as-is.
  throw error
})
```

#### Observing responses

You can use the `response` event to transparently observe any incoming responses in your Node.js process.

```js
interceptor.on(
  'response',
  ({ response, responseType, request, requestId }) => {
    // react to the incoming response...
  }
)
```

> Note that the `responseType` property equals `"mock"` if you resolved this request in the `request` event listener using the `controller.respondWith()` method, and `"original"` for the responses received from the actual server.

### `ClientRequestInterceptor`

Intercepts HTTP requests made via `http.ClientRequest`—that is, `http.get()`/`http.request()` and their `https` counterparts (this also covers third-party clients built on top of them, like Axios or Got).

```js
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()
interceptor.apply()

interceptor.on('request', ({ request, controller }) => {
  console.log(request.method, request.url)
  controller.respondWith(new Response('Hello world'))
})
```

This interceptor implements the same events as [`HttpRequestInterceptor`](#httprequestinterceptor)—`request`, `response`, and `unhandledException`—and you subscribe to them in the same way. See the sections above for observing, modifying, and mocking requests.

### `XMLHttpRequestInterceptor`

Intercepts HTTP requests made via `XMLHttpRequest`, both in the browser and in Node.js (e.g. in test environments polyfilling `XMLHttpRequest`, like JSDOM).

```js
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.apply()

interceptor.on('request', ({ request, controller }) => {
  console.log(request.method, request.url)
  controller.respondWith(new Response('Hello world'))
})
```

This interceptor implements the same events as [`HttpRequestInterceptor`](#httprequestinterceptor)—`request`, `response`, and `unhandledException`—and you subscribe to them in the same way.

This interceptor has two versions: `/node` and `/web`. The `@mswjs/interceptors/XMLHttpRequest` import automatically loads the correct one based on your environment. If you wish, you can import the exact version manually:

```js
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest/node'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest/web'
```

### `FetchInterceptor`

Intercepts HTTP requests made via the global `fetch` function. In Node.js, the global `fetch` is powered by Undici; in the browser, it is the native `window.fetch`.

> To intercept the requests made via _direct_ Undici imports (e.g. `fetch` or `request` from the `undici` package), use the [`HttpRequestInterceptor`](#httprequestinterceptor) instead—those requests do not go through the global `fetch` but are still intercepted at the socket level.

```js
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()
interceptor.apply()

interceptor.on('request', ({ request, controller }) => {
  console.log(request.method, request.url)
  controller.respondWith(new Response('Hello world'))
})
```

This interceptor implements the same events as [`HttpRequestInterceptor`](#httprequestinterceptor)—`request`, `response`, and `unhandledException`—and you subscribe to them in the same way.

This interceptor has two versions: `/node` and `/web`. The `@mswjs/interceptors/fetch` import automatically loads the correct one based on your environment. If you wish, you can import the exact version manually:

```js
import { FetchInterceptor } from '@mswjs/interceptors/fetch/node'
import { FetchInterceptor } from '@mswjs/interceptors/fetch/web'
```

### `WebSocketInterceptor`

Intercepts WebSocket connections created using the global WHATWG `WebSocket` class.

> [!IMPORTANT]
> The `WebSocketInterceptor` provides its connection-level API only for the global WHATWG `WebSocket` class. In Node.js, WebSocket handshakes issued by other clients (e.g. the `ws` package or direct Undici usage) are additionally interceptable at the HTTP layer as `Upgrade` requests via the [`HttpRequestInterceptor`](#httprequestinterceptor). Polling transports (HTTP/XHR long-polling) surface as regular HTTP requests, not as WebSocket connections.

```js
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()
interceptor.apply()
```

Unlike the HTTP-based interceptors that share the same `request`/`response` events, the WebSocket interceptor only emits the `connection` event and lets you handle the incoming/outgoing events in its listener.

#### Important defaults

1. Intercepted WebSocket connections are _not opened_. To open the actual WebSocket connection, call [`server.connect()`](#connect) in the interceptor.
1. Once connected to the actual server, the outgoing client events are _forwarded to that server by default_. If you wish to prevent a client message from reaching the server, call `event.preventDefault()` for that client message event.
1. Once connected to the actual server, the incoming server events are _forwarded to the client by default_. If you wish to prevent a server message from reaching the client, call `event.preventDefault()` for the server message event.
1. Once connected to the actual server, the `close` event received from that server is _forwarded to the client by default_. If you wish to prevent that, call `event.preventDefault()` for that close event of the server.

#### Observing connections

Whenever a WebSocket instance is constructed, the `connection` event is emitted on the WebSocket interceptor.

```js
interceptor.on('connection', ({ client }) => {
  console.log(client.url)
})
```

The `connection` event exposes the following arguments:

| Name     | Type                                                      | Description                                                                         |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `client` | [`WebSocketClientConnection`](#websocketclientconnection) | An object representing a connected WebSocket client instance.                       |
| `server` | [`WebSocketServerConnection`](#websocketserverconnection) | An object representing the original WebSocket server connection.                    |
| `info`   | `object`                                                  | Additional WebSocket connection information (like the original client `protocols`). |

#### `WebSocketClientConnection`

##### `.addEventListener(type, listener)`

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

##### `.removeEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Removes the listener for the given event type.

##### `.send(data)`

- `data`, `string | Blob | ArrayBuffer`

Sends the data to the intercepted WebSocket client.

```js
client.send('text')
client.send(new Blob(['blob']))
client.send(new TextEncoder().encode('array buffer'))
```

##### `.close(code, reason)`

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

#### `WebSocketServerConnection`

##### `.connect()`

Establishes the connection to the original WebSocket server. Connection cannot be awaited. Any data sent via `server.send()` while connecting is buffered and flushed once the connection is open.

##### `.addEventListener(type, listener)`

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

##### `.removeEventListener(type, listener)`

- `type`, `string`
- `listener`, `EventListener`

Removes the listener for the given event type.

##### `.send(data)`

- `data`, `string | Blob | ArrayBuffer`

Sends the data to the original WebSocket server. Useful in a combination with the client-sent events forwarding:

```js
client.addEventListener('message', (event) => {
  server.send(event.data)
})
```

##### `.close()`

Closes the connection with the original WebSocket server. Unlike `client.close()`, closing the server connection does not accept any arguments and always assumes a graceful closure. Sending data via `server.send()` after the connection has been closed will have no effect.

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

Applies multiple request interceptors at the same time. Use it to combine interceptors to capture requests from different request-issuing modules at once.

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: [
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

interceptor.apply()

// Spy on both XMLHttpRequest and fetch requests in this process.
interceptor.on('request', listener)
```

Instead of listing the interceptors manually, you can provide one of the pre-defined presets to the `interceptors` option to capture all requests for that environment:

#### Node.js preset

This preset combines the following interceptors:

- `ClientRequestInterceptor`
- `XMLHttpRequestInterceptor`
- `FetchInterceptor`

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import nodeInterceptors from '@mswjs/interceptors/presets/node'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: nodeInterceptors,
})

interceptor.on('request', listener)

interceptor.apply()
```

#### Browser preset

This preset combines the following interceptors:

- `XMLHttpRequestInterceptor`
- `FetchInterceptor`

```js
import { BatchInterceptor } from '@mswjs/interceptors'
import browserInterceptors from '@mswjs/interceptors/presets/browser'

const interceptor = new BatchInterceptor({
  name: 'my-interceptor',
  interceptors: browserInterceptors,
})

interceptor.on('request', listener)

interceptor.apply()
```

### `RemoteHttpInterceptor`

Enables request interception in the current process while delegating the response resolution logic to the _parent process_. **Requires the current process to be a child process**. Requires the parent process to establish a resolver by calling the `createRemoteResolver` function.

```js
// child.js
import { RemoteHttpInterceptor } from '@mswjs/interceptors/RemoteHttpInterceptor'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'

const interceptor = new RemoteHttpInterceptor({
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

resolver.apply()
```

## Special mention

The following libraries were used as an inspiration to write this low-level API:

- [`node`](https://github.com/nodejs/node)
- [`nock`](https://github.com/nock/nock)
- [`mock-xmlhttprequest`](https://github.com/berniegp/mock-xmlhttprequest)
