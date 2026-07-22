# SMTP interceptor: client/server architecture plan

Restructure the SMTP interceptor from `controller.claim()/passthrough()` to the
WebSocket interceptor's architecture: claim-always, two actor connections
(`client`/`server`), lazy real connection, cancelable forwarding on both wires.
Target session event payload: `{ session, client, server }`.

## Step 1. Bypass connection factory (`src/interceptors/net`)

**What:** Expose a `createConnection(): net.Socket | tls.TLSSocket` factory on the
socket `connection` event (or controller), bound to the **original**
`net.connect`/`tls.connect` with the intercepted `connectionOptions`.

**Why:** This is not `socketController.passthrough()`. Passthrough *consumes* the
intercepted connection: it dials the destination and fuses the client socket to
it via the handle swap (`socket-controller.ts:739`), is mutually exclusive with
`claim()` (`:383`, `:396`), welds the real socket's lifecycle (and dial failures)
to the client's, and surrenders the write wire. The new architecture needs the
opposite: a NEW, independent upstream socket while the client socket stays
claimed — dialed before the greeting (bypass), mid-session (subordinate),
re-dialed, or closed, with failures as rejected promises the resolver can catch.
The dial path already exists internally (passthrough creates its real socket from
the original options without re-interception, `:472`) but is fused to the handle
swap; extract it into a factory (the analog of ws's `createConnection` =
`Reflect.construct` on the un-patched class, `WebSocket/index.ts:75-77`) so the
SMTP layer's own dial is never re-intercepted. TLS is mirrored from
`session.secure`.

## Step 2. `SmtpClientConnection` (refactor `smtp-controller.ts`)

**What:** The current controller minus mode selection. It owns the claimed socket
and the client-stream parser (`#processBuffer` stays: line framing, DATA
terminator, AUTH continuation lines, dot-unstuffing), which now always runs —
not only when claimed.

- Emits the typed command events (all event classes, verdict methods, and the
  AUTH challenge machinery survive as-is).
- A verdict call authors the reply, calls `stopImmediatePropagation()` on the
  command event (first-reply-wins for MSW), and marks the command frame handled.
- Each parsed frame (command line or DATA payload) is surfaced to the server
  actor through an internal, symbol-keyed hook — raw bytes + handled flag,
  invoked on a microtask after command listeners ran. Not public API; it is the
  direct replacement for ws's transport `outgoing` event without the
  intermediary object.
- Public surface: `addEventListener` (command events), `reply()`, `greet()`
  (extracted from `claim(greeting)`), `abort()`, `error()`; session metadata.
- Mode-sensitive defaults replace the `isReplied` fallbacks: no server connected
  → mock default replies (auto-accept); server connected → unhandled frames
  forward and the real server answers.
- Delete `claim()`/`passthrough()`. Rename the `command` event key to
  `unknown-command`.

**Why:** Separates "authoring to the client" from "choosing the session's fate" —
the fate is now implicit (did anyone call `server.connect()` before the
greeting). Parsing always running is what makes command events (including
`message` with captured DATA bytes) fire in bypass mode, where today passthrough
re-parses commands only for phase correlation and skips DATA bodies.

## Step 3. `SmtpServerConnection` (rewrite `smtp-server-connection.ts`)

**What:** Owned upstream connection, constructed with the client connection and
the Step 1 factory (ws's server takes `(client, transport, createConnection)`;
here just `(client, createConnection)`):

- `connect(): Promise<void>` — dials via the factory. Resolves on the real
  greeting, rejects on dial failure. Called before the client greeting → the real
  greeting forwards (bypass mode); called after the mock greeted → the greeting is
  swallowed (subordinate mode). Unlike ws's sync `connect()`, the promise is
  required for the greeting gate and the dead-host fallback
  (`try { await server.connect() } catch { /* mock greets */ }`).
- Auto-forwarding, both wires, ws-style (`WebSocketServerConnection.ts:76-97`,
  `:338-383`): unhandled client frames (via the Step 2 hook) → raw bytes to the
  real socket; upstream replies → parsed (`#extractReply` stays), correlated
  (`#phaseQueue` stays), emitted as the typed phase events → raw bytes to the
  client unless `preventDefault()`.
- `close()` / `destroy()` with dual `AbortController` teardown to break
  close-forwarding loops (ws `:59-60`, `:308`, `:396`).
- Internal `kSend`-style symbol distinguishing auto-forwarded from
  handler-authored upstream writes (ws `:88-94`) so MSW can log correctly.

**Why:** This is the keystone: the client socket stays claimed, the SMTP layer
owns both wires, and every mode 2 requirement (withhold a client command, patch a
real reply) becomes a handled/`defaultPrevented` check instead of an impossible
handle-swap mediation.

## Step 4. Preamble replay and `send()` (extends Step 3)

**What:**

- Record the transaction state where replay can reach it: envelope
  (currently `SmtpController.#envelope`, private) and message bytes move to the
  session/transaction record alongside `heloHostname`/`auth`.
- SMTP command authoring on the server connection: send EHLO/AUTH/MAIL/RCPT/DATA
  and await correlated replies (reply parsing exists; authoring is new). Add the
  dot-stuffing **encoder** (inverse of `undoDotStuffing`, `smtp-controller.ts:1014`).
- `send(event: SmtpMessageEvent): Promise<SmtpServerMessageEvent>` — late
  `connect()` + swallow greeting + replay preamble + transfer the message; resolve
  with the real verdict (code, lines, `queueId`), reject on dial/replay failure.
  Failures never touch the client wire — the handler authors what the client sees.
- Reuse the connection across pooled transactions (RSET between deliveries).

**Why:** Mode 3. ws gets connection replay for free — its `createConnection`
re-runs the WebSocket handshake. The SMTP preamble is its handshake; replay is
`connect()` spelled out in SMTP commands, not foreign machinery.

## Step 5. Session event restructure (`smtp/index.ts`)

**What:**

- Always `socketController.claim()` on connection (ws: every instance is a mock).
- Build both actors; emit the session event with `{ session, client, server }`
  via `emitAsPromise` on a microtask (async resolvers; ws `index.ts:88-110`).
  Keep the IPC early-return.
- No listeners → `server.connect()` automatically: passthrough-by-default
  (ws `index.ts:112-130`), replacing today's `socketController.passthrough()`
  fallback.
- Greeting authored after the resolver settles: `connect()` was called → real
  greeting already forwarded; otherwise → `greet(220)` default unless the
  resolver called `client.greet()`.
- Listener exceptions → `client.error()` (ws translates to a 1011 close;
  current behavior at `smtp/index.ts:131-139` is already correct).
- Export the actor protocols (abstract classes, ws-style
  `*ConnectionProtocol`) for MSW to type against.

**Why:** The session event is the MSW resolver. Deferred greeting + promise emit
is what makes async resolvers and the mode decision possible.

## Step 6. Tests

**What:** Migrate `test/modules/smtp/*.test.ts` from
`controller.claim()/passthrough()` to `client`/`server`. New coverage:

- Bypass: real greeting relayed; client command events observed; command withheld
  by a verdict; real reply patched via `preventDefault` + `client.reply()`.
- Subordinate: `send()` happy path (real `queueId` surfaced), replay of
  AUTH/EHLO state, pooled second transaction over one upstream connection,
  dial failure → rejected promise → client sees only the handler's verdict.
- Defaults: no listeners → full passthrough; listeners without verdicts +
  connected server → forwarding; mock defaults otherwise.
- Dead-host fallback: `connect()` rejects → resolver falls back to mock.
- `resend.test.ts` unchanged as the third-party regression.

**Order:** 1 → 2/3 (interdependent, land together) → 5 → 4 → 6 throughout.
Steps 1–3 and 5 are one breaking change to the SMTP public API; 4 can follow
separately.
