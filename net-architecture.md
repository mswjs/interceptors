## Net-based Interception

Your task is to implement the network packet interception on the `net.Socket` level in Node.js. The underlying `SocketInterceptor` is already implemented at `src/interceptors/net/index.ts`. Below, are the outline of the necessary pieces.

## `SocketInterceptor`

- Responsible for patching `net.createConnection` and `net.connect`. Once patched, any created connection receive a mock socket instance.
- The mock socket instance pretends to successfully establish the connection with whatever connection options provided. This is so connecting to the non-existing hosts works in the mock-first scenario.
- The mock socket is wrapped in a `controller`. Controller is used by a higher-level interceptors to control the underlying socket. Since the data sent over socket is ambiguous, the controller only allows for `.connect()` (to mock the connection), `.passthrough()` (establish the connection as-is), and `.errorWith()` (abort the socket connection).
- Only for the user, a special socket reference is created and exposed as the `socket` argument in the `connection` listener. That special socket is meant to represent the intercepted socket instance _from the server's perspective_. This means that `socket.write()` on the actual socket (e.g. the one created by `net.connect` and then used via `http.ClientRequest`) are translated to the "data" events being emitted on the special server-side `socket`. The server-side socket is used ONLY for this purpose: to observe what the client writes _and_ write data _to_ the client from the `connection` listener as if it has been sent from the "server".

## `HttpRequestInterceptor`

- `src/interceptors/http/index.ts`
- This is a higher-level interceptor that relies on `SocketInterceptor` and routes all the intercepted socket packets through the HTTP request parser (we're using Node's parser).
- If the request parser tells us that the sent packet is an HTTP request message header, the interceptor then proceeds with handling that request. It emits the `request` event for the consumer, and uses the established `RequestController` to control the request flow (`.respondWith`, `.errorWith`, etc). These APIs are already created and functional, they need no change.
- The missing parts in the `HttpRequestInterceptor` is establishing the passthrough connection properly. For that, the socket controller accepted the `createConnection` option that constructs the bypassed socket. That works. But the socket hangs forever.

## Requirements

- Feel free to improve the existing classes but stay strictily within each class' responsibilities. Those must not leak.
- The overall architecture must compose: MockSocket -> SocketController -> Higher-level interceptors.
- Introduce absolutely no workarounds, zero.
- You will need to reference Node.js internals, particularly `net` and `http` modules to implement this functionality properly.
- Feel free to rely on Node.js internals knowledge and be clever, but not hacky.
- Feel free to `@ts-ignore` property access to Node.js internals, such as `socket.parser`.
- Do not comment your code.
- You can verify your changes via `pnpm test:node test/modules/http/response/http-response-delay.test.ts`. All the test cases must pass there.
