# `smtp` API in MSW

```ts
import { smtp } from 'msw/node'

export const handlers = [
  smtp('smtp.domain.com:*', ({ client, server }) => {
    client.addEventListener('auth', (event) => {
      if (event.password !== 'valid') {
        event.reject({ code: 535, reason: 'Bad credentials' })
      }
    })

    client.addEventListener('message', async (event) => {
      const email = await event.email() // lazy MIME parse
      email.subject
      email.html
      event.accept({ queueId: 'MOCK-1' })
    })
  }),
]
```

## Model

`smtp(predicate, resolver)` returns a handler. The resolver runs once per **session** (RFC 5321: one connection, greeting → QUIT; N message transactions inside). Resolver args are two actors:

- **`client`** — the intercepted side (your app under test). Emits command events, receives replies.
- **`server`** — lazy handle to the real upstream. Inert until `connect()`.

### Three modes

Greeting authority is decided once, before the greeting. `server.connect()` timing selects the mode:

1. **Mock (default).** No `connect()`. Mock greets `220`, authors all replies via event verdicts. No real connection ever.
2. **Bypass + patching.** `await server.connect()` in the resolver (before greeting). Real server speaks: greeting and codes relay to the client, commands auto-forward after listeners run. Patch codes via `preventDefault()` on `server` events + `client.reply(code, text)`.
3. **Subordinate real connection** (`bypass(request)` analogue). Late `connect()` / `server.send(event)`: new real connection, greeting swallowed, recorded preamble (EHLO, AUTH, envelope) replayed, real verdict returned to the handler — never raced onto the wire. Handler authors what the client sees (response patching).

```ts
// Mode 2
smtp('smtp.domain.com:*', async ({ client, server }) => {
  await server.connect()
  server.addEventListener('message', (event) => {
    event.preventDefault() // withhold real "250 queued"
    client.reply(550, '5.7.1 Blocked by policy')
  })
})

// Mode 3
smtp('smtp.domain.com:*', ({ client, server }) => {
  client.addEventListener('message', async (event) => {
    const reply = await server.send(event)
    event.accept({ queueId: `patched-${reply.queueId}` })
  })
})
```

## Decisions

- **Single session resolver, no link.** Mock/passthrough is session-scoped and contextualizes every command listener; distributed per-command handlers can't see the mode. One resolver makes it lexically visible. No link: SMTP has no cross-connection utilities (no broadcast) to hang off one.
- **`client`/`server` naming.** MSW invariant (client = intercepted app, server = real remote, as in `ws`) + RFC 5321 defines client/server per hop — the connecting app is the client of this hop.
- **Layering: first matching handler owns the session.** Resolver runs exclusively (http-like). No cross-handler propagation. Known consequence: an override shadows base observers for that session.
- **Greeting authored after the resolver settles.** Enables async resolvers and dead-host fallback: `try { await server.connect() } catch { /* mock greets */ }`.
- **Can't-greet-twice ⇒ no mid-session passthrough.** Modes differ only by connect-before-greeting vs late subordinate connect. No voice transfer, no reply-suppression races.
- **Unified verdicts.** In mock mode, verdicts author replies. In bypass mode, a verdict on a client command event implicitly prevents forwarding that command and authors the code locally — desync of the real server is the user's responsibility (same as ws `preventDefault`).
- **Events, not resolvers, for commands.** SMTP is phased; the interceptor ships type-safe events with per-phase verdict methods (`accept`/`reject`/`defer`, phase-specific payloads/codes). A generic return-a-reply API loses that typing. Full catalog on `client`: `helo`, `auth`, `sender`, `recipient`, `data`, `message`, `quit`, `unknown-command`. `server` mirrors the interceptor's reply-phase events.
- **Session-level failures are in-scope methods.** `client.greet({ code: 421 })`, `client.error()` (ECONNRESET) — server-down simulation without exposing the controller.
- **Predicate: `host[:port]`, `*` wildcards, no scheme.** No default protocol can be assumed. TLS readable on the session (`client.tls`), not matched on.
- **Matched → resolver owns it. Unmatched → `onUnhandledRequest`.** Fate decided at connect (server speaks first). Unmatched traffic risks sending real email; `'error'` guards CI. Needs a protocol-generic `onUnhandledRequest` shape.
- **`message` vs `email`.** `message` = SMTP transaction (envelope, verdicts). `email` = parsed MIME via `await event.email()` (subject/html/text/headers/attachments), parsed lazily in MSW — the one protocol-centric DX gap justifying enrichment. Raw `Buffer` stays.

## Interceptor work required

- Mode 2 exists today (`passthrough()` → `SmtpServerConnection`, `preventDefault`).
- Mode 3 is new: swallow-greeting connect + preamble replay from recorded session state; replay failures reject the handler's promise, never reach the client. Pooled sessions reuse the connection (RSET between transactions); `connect()` mirrors the client's TLS.

## Punted (v1)

- **Life-cycle events (`smtp:message`).** Fix for override-shadowed observers when demand appears.
- **STARTTLS.** Interceptor doesn't model it; `requireTLS` clients fail against mocks. Needs interceptor-level answer first.
