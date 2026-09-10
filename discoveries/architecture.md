# Architecture and lifecycle notes

Read this before changing interception, socket timing, or related tests. Based on
the source and test suites read on 2026-09-10. Existing focused notes:
[HTTP/TLS](./http.mdx) and [Undici](./undici.mdx).

## Purpose and layers

Interceptors observes and controls network traffic while executing as much of the
native client/network stack as possible. API mocking is one use of it. A mocked
Node.js request still runs through the real client, its serialization, sockets,
and response parsing. Do not replace that behavior with an API-level shortcut.

| Layer | Responsibility / entry point |
| --- | --- |
| Socket | `src/interceptors/net/index.ts` patches `Socket.prototype.connect`; TCP/TLS controllers intercept handles and writes. Works below client libraries and captured `net.connect` references. |
| HTTP source | `src/interceptors/http/source.ts` subscribes to mirrored socket data, detects HTTP, parses requests, handles decisions, and serializes mocked responses through native `ServerResponse`. |
| Parsers | `src/interceptors/http/http-parser.ts` builds request streams; `http-parser/index.ts` wraps llhttp/WASM and message boundaries. |
| HTTP facade | `HttpRequestInterceptor` forwards all HTTP source events, including direct Undici usage. |
| Node client facades | `ClientRequest`, `fetch/node`, and `XMLHttpRequest/node` annotate initiators through scoped `AsyncLocalStorage` and filter shared source events. The native clients still perform the requests. |
| Browser clients | `fetch/web` and `XMLHttpRequest/web` intercept at the API boundary and implement response/event behavior there. Node's socket mechanism does not apply. |
| WebSocket | Separate WHATWG `WebSocket` interception and client/server transport API. HTTP interception can independently observe upgrade requests from other clients. |
| Composition | `Interceptor` owns shared singleton leases; `BatchInterceptor` bridges events and deduplicates the same event object. Disposing one owner must not disable another. |
| Remote | `remote-http-interceptor.ts` sends serialized requests/responses over child-process IPC. It has its own transport limitations. |

Initiator attribution requires the corresponding client facade. With only the
HTTP interceptor, the fallback initiator is the socket. Async context must survive
foreign body streams without leaking into unrelated subsequent requests.

## Socket flow: bytes must exist before a protocol decision

```text
client starts connecting -> controller intercepts native handle
  client already writes? -> buffer and expose those bytes
  client waits for connect? -> synthetic connect -> client writes -> expose bytes
mirrored socket data -> protocol parser -> request listener -> handling decision
  claim       -> complete mocked connection; deliver mock bytes to native client
  passthrough -> real connection; flush buffered writes; forward real events/data
```

The socket exposed in `SocketConnectionEvent` is mirrored: its `data` means the
client **wrote** bytes; its `write()` supplies bytes **to** the client. It is not
the raw client socket's readable side.

**The synthetic connection notification is necessary.** Undici waits for
`connect`/`secureConnect` before writing its HTTP message. Waiting for a request
decision before allowing those callbacks creates a cycle: no connect, no bytes,
no request, no decision. `http.request().end()` often supplies bytes earlier;
`request.end()` inside a connect callback exercises the deferred path.

**Passthrough can require both the synthetic and real `connect` notifications.**
The real notification must not be suppressed merely because the synthetic one
already ran. A blanket “connect exactly once” fix is wrong. Conversely, immediate
passthrough need not take the synthetic path. Separate persistent `.on` listeners
from `.once` listeners and constructor callbacks: `emulateConnect()` invokes raw
listeners so Node's once wrappers are consumed. Also distinguish socket `connect`
from the HTTP request's `connect` event for a CONNECT tunnel.

Pending writes must be observable and their callbacks must allow further body
writes. Buffer before invoking observers: a synchronous observer can claim or
pass through immediately. Claim discards pending network writes; passthrough
flushes them once, preserving ordering and backpressure. TLS permits only one
native write in flight; bypassing its write queue can crash Node.

## Three different lifetimes

1. **Physical socket:** can outlive many HTTP exchanges.
2. **Exchange decision:** `SocketController.PENDING/CLAIMED/PASSTHROUGH` resets
   for subsequent exchanges. It is not equivalent to `socket.connecting`.
3. **Listener promise:** describes work returned by that listener. Registering a
   future `socket.on('data', ...)` callback does not make the emitter await it.

Node's HTTP agent emits `free`; Undici does not. The HTTP parser therefore also
schedules reset at message completion, applied before the next write. Resetting
inside the previous write can discard bytes; resetting too late can leak a later
mocked request to the real server. Reused sockets do not reconnect per request.

The request event is produced at headers completion with a streaming body. Parser
execution continues while async request listeners consume that body. Do not make
the production of body bytes wait for a listener that is reading those bytes.

`RequestController` permits one decision. `handleRequest()` races listener
completion, request abort, and `controller.handled`; completing a decision does
not imply all listener work or response streaming has finished. Response observers
must finish before the client receives the response. On passthrough, cork client
delivery while allowing the parser to receive real data; pausing only public
`data` events does not cover clients that use `read()`.

## Boundaries that must remain intact

- Keep-alive supports mock -> real and real -> mock on the same socket. No stale
  request IDs, state, listeners, or bytes may cross exchanges.
- A successful mocked CONNECT establishes a tunnel. Subsequent bytes target its
  authority, not the never-contacted proxy. Detect the tunneled protocol anew;
  support HTTP and non-HTTP traffic and client half-close. Refused tunnels close.
- Upgrade ends HTTP parsing. Free llhttp after `execute()` returns, outside its
  native callbacks. Do not feed upgraded protocol bytes back into HTTP parsing.
- Non-HTTP traffic and malformed HTTP must preserve native passthrough behavior.
- Passthrough preserves original DNS/TLS options, address/ref state, write queues,
  timeouts, half-open behavior, and error/end/close ordering across handle swaps.
- Mock response stream failures before versus after headers reach the client
  produce different native request/response errors. Do not flatten them.
- Browser and Node fetch/XHR differ in preflight, compression observation, error
  wrapping, and supported inputs. Neutral tests deliberately branch by runtime.
- WebSocket listeners make connections mock-first; no listeners allows real
  connection. `server.connect()` enables forwarding; cancelable message/close
  events control forwarding. Its internal real dial bypasses interception once;
  HTTP requests started from later WebSocket callbacks must still be intercepted.

## Test map

Paths below are relative to `test/` unless prefixed with `src/`.

| Guarantee | Read these tests |
| --- | --- |
| Connect paths and callbacks | `modules/net/compliance/socket-connect.test.ts`, `socket-events.test.ts`, `socket-connecting.test.ts`; `modules/net/intercept/net-connect.test.ts`; `modules/http/compliance/http-req-end-after-connect.test.ts` |
| Mirrored directions, pending writes | `modules/net/socket-server-{data,write,end,destroy}.test.ts`; `modules/net/compliance/socket-{write,backpressure,half-open}.test.ts`; `modules/http/compliance/http-req-write.test.ts` |
| TLS write ordering | `modules/net/regressions/tls-passthrough-buffered-writes.test.ts` and its subprocess fixture |
| Per-exchange state and isolation | `modules/http/third-party/undici.test.ts`; `modules/http/compliance/http-keep-alive-passthrough-then-mocked.test.ts`; `modules/http/regressions/http-keep-alive-*.test.ts` |
| Parsing/tunnels/upgrades | `modules/http/regressions/http-parser-error.test.ts`, `http-non-http-socket-passthrough.test.ts`; `modules/http/intercept/http-connect.test.ts`; `modules/http/compliance/http-upgrade-request.test.ts` |
| Response completion and failures | `modules/http/response/http-await-response-event.test.ts`, `http-response-readable-stream.test.ts`; `modules/fetch/response/fetch-await-response-event.neutral.test.ts`; `modules/fetch/compliance/fetch-response-cancel.neutral.test.ts` |
| Attribution and composition | `features/request-{initiator,context-leak}.test.ts`; `modules/http/regressions/http-request-initiator-async-context.test.ts`; `src/batch-interceptor.test.ts`; `src/interceptors/http/forward-events.test.ts` |
| WebSocket recursion/exemption | `modules/WebSocket/compliance/websocket-passthrough-upgrade.test.ts` |
| Native client contracts | Remaining `modules/{net,http,fetch,XMLHttpRequest,WebSocket}` compliance/response suites and `third-party/`; read runtime skips and assertions, not just test titles. |

## Connection emission and fallback

`emitAsPromise()` emits the connection event; it does not decide ownership.
The published `rettime@0.11.11` implementation awaits each listener before
invoking the next. Connection listeners can return after installing future data
handlers, so completion of emission does not imply an unhandled connection.
With listeners, keep the socket pending until an explicit claim or passthrough.
With no connection listeners, select passthrough synchronously before awaiting
emission, preventing unnecessary synthetic connect (particularly for Unix pipes,
whose handle connection starts without DNS lookup).

The HTTP source returns after installing its parser. It handles non-HTTP traffic
by scheduling passthrough after the current write/observers complete, checking
that the socket is still pending and alive. Malformed HTTP with a pending request
uses that request controller's passthrough. There is no decline/counting API and
no promise holding a connection listener open until socket closure.

The Unix tests still require one connect with no interception listeners. A
separate deferred-passthrough test requires synthetic plus real connect and
verifies once callbacks and buffered bytes are not duplicated. The Undici test
still installs its observer after the HTTP source and requires both requests to
be observed as pending. `socket-controller-claim.test.ts` covers sequential async
listeners and a data handler claiming after its connection listener has returned.

For verification, Vitest has separate `unit`, `node`, `memory`, and Chromium
browser projects. Several tests import package exports from `lib`, so build before
a full run. CI targets Node 22/24/26. Use the same Node and emitter build for
baseline comparisons; local server tests require permission to bind sockets.
Local dependency experiments are outside these findings.
