import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { applyDotStuffing, CRLF, DATA_TERMINATOR } from './dot-stuffing'
import { SmtpEventTarget } from './event-target'
import type { SmtpSession } from './smtp-session'
import {
  kDeliverReply,
  kForwardFrame,
  kGreeted,
  kSetServer,
  kUpstreamEnd,
  kUpstreamError,
  type SmtpClientConnection,
  type SmtpMessageEvent,
} from './smtp-client-connection'

/**
 * A single reply from the real SMTP server. Every reply carries the
 * three-digit code and the text lines that followed it (a multiline
 * reply, such as the "EHLO" capabilities, yields multiple lines).
 */
interface SmtpServerReplyData {
  code: number
  lines: Array<string>
}

/**
 * The base class of every reply the real SMTP server sends during a
 * bypassed session. Prevent the default of the event to stop the
 * reply from reaching the client, then author what the client sees
 * through the client connection (e.g. `client.reply()`).
 */
abstract class SmtpServerReplyEvent<
  EventType extends string,
> extends TypedEvent<SmtpServerReplyData, void, EventType> {
  /**
   * The three-digit reply code the real server sent (e.g. 250).
   */
  public code: number
  /**
   * The text of the reply, one entry per line.
   */
  public lines: Array<string>

  constructor(type: EventType, data: SmtpServerReplyData) {
    super(type, { data: { code: data.code, lines: data.lines } })

    this.code = data.code
    this.lines = data.lines
  }

  /**
   * The reply text, with the individual lines joined by a newline.
   */
  public get text(): string {
    return this.lines.join('\n')
  }
}

/**
 * The greeting the real server sends first ("220"/"554"/"421").
 */
export class SmtpServerGreetingEvent extends SmtpServerReplyEvent<'greeting'> {
  constructor(data: SmtpServerReplyData) {
    super('greeting', data)
  }
}

interface SmtpServerHeloReplyData extends SmtpServerReplyData {
  capabilities: Array<string>
}

/**
 * The real server's reply to "EHLO"/"HELO".
 */
export class SmtpServerHeloEvent extends SmtpServerReplyEvent<'helo'> {
  /**
   * The ESMTP capabilities the server advertised (the "EHLO" reply
   * lines after the greeting line). Empty for a "HELO" reply.
   */
  public capabilities: Array<string>

  constructor(data: SmtpServerHeloReplyData) {
    super('helo', data)

    this.capabilities = data.capabilities
  }
}

/**
 * The real server's reply during authentication ("AUTH", RFC 4954).
 * A "334" reply is an intermediate challenge; the final reply is the
 * authentication result ("235"/"535"/...).
 */
export class SmtpServerAuthEvent extends SmtpServerReplyEvent<'auth'> {
  constructor(data: SmtpServerReplyData) {
    super('auth', data)
  }
}

/**
 * The real server's reply to "MAIL FROM".
 */
export class SmtpServerSenderEvent extends SmtpServerReplyEvent<'sender'> {
  constructor(data: SmtpServerReplyData) {
    super('sender', data)
  }
}

interface SmtpServerRecipientReplyData extends SmtpServerReplyData {
  address: string
}

/**
 * The real server's verdict for a single recipient ("RCPT TO").
 * A rejected recipient (e.g. "550") is how the real server signals a
 * partial delivery.
 */
export class SmtpServerRecipientEvent extends SmtpServerReplyEvent<'recipient'> {
  /**
   * The recipient address this reply is the verdict for.
   */
  public address: string

  constructor(data: SmtpServerRecipientReplyData) {
    super('recipient', data)

    this.address = data.address
  }
}

/**
 * The real server's reply to "DATA" ("354" to begin the transfer,
 * or a rejection when there is no valid recipient).
 */
export class SmtpServerDataEvent extends SmtpServerReplyEvent<'data'> {
  constructor(data: SmtpServerReplyData) {
    super('data', data)
  }
}

interface SmtpServerMessageReplyData extends SmtpServerReplyData {
  queueId?: string
}

/**
 * The real server's final verdict on the transferred message
 * ("250 ... queued as <id>" on success, "4xx"/"5xx" otherwise).
 * This is the delivery outcome — the SMTP analog of an HTTP response.
 */
export class SmtpServerMessageEvent extends SmtpServerReplyEvent<'message'> {
  /**
   * The queue identifier the server assigned to the accepted message,
   * parsed from the reply text ("queued as <id>"), if present.
   */
  public queueId?: string

  constructor(data: SmtpServerMessageReplyData) {
    super('message', data)

    this.queueId = data.queueId
  }
}

/**
 * The real server's reply to "QUIT" ("221").
 */
export class SmtpServerQuitEvent extends SmtpServerReplyEvent<'quit'> {
  constructor(data: SmtpServerReplyData) {
    super('quit', data)
  }
}

/**
 * Any reply the connection could not correlate to a known phase
 * (e.g. the reply to "RSET"/"NOOP", or an unsolicited "421").
 */
export class SmtpServerReplyEventGeneric extends SmtpServerReplyEvent<'reply'> {
  constructor(data: SmtpServerReplyData) {
    super('reply', data)
  }
}

type SmtpServerConnectionEventMap = {
  greeting: SmtpServerGreetingEvent
  helo: SmtpServerHeloEvent
  auth: SmtpServerAuthEvent
  sender: SmtpServerSenderEvent
  recipient: SmtpServerRecipientEvent
  data: SmtpServerDataEvent
  message: SmtpServerMessageEvent
  quit: SmtpServerQuitEvent
  reply: SmtpServerReplyEventGeneric
}

export type SmtpPhase =
  | { phase: 'helo' }
  | { phase: 'auth' }
  | { phase: 'sender' }
  | { phase: 'recipient'; address: string }
  | { phase: 'data' }
  | { phase: 'message' }
  | { phase: 'quit' }
  | { phase: 'reply' }

interface SmtpReply {
  code: number
  lines: Array<string>
  raw: Buffer
}

/**
 * A replay or delivery failure of `server.send()`: the real server
 * rejected one of the replayed session phases before (or instead of)
 * accepting the message transfer.
 */
export class SmtpDeliveryError extends Error {
  constructor(
    /**
     * The session phase the real server rejected.
     */
    public readonly phase: 'helo' | 'auth' | 'sender' | 'recipient' | 'data',
    /**
     * The rejecting reply of the real server.
     */
    public readonly reply: { code: number; lines: Array<string> }
  ) {
    super(
      `Failed to deliver the message: the real server rejected the "${phase}" phase with "${reply.code} ${reply.lines.join(' ')}"`
    )
    this.name = 'SmtpDeliveryError'
  }
}

interface SmtpServerConnectionOptions {
  session: SmtpSession
  client: SmtpClientConnection
  clientSocket: net.Socket | tls.TLSSocket
  createConnection: () => net.Socket | tls.TLSSocket
}

/**
 * The real SMTP server of a session: a lazy handle that stays inert
 * until `connect()`.
 *
 * Connecting before the client is greeted bypasses the session: the
 * real server speaks (its greeting and replies forward to the client),
 * the client commands nobody replied to forward to it, and every reply
 * is emitted as a phase-named event before being forwarded — prevent
 * the default of an event to withhold that reply and author your own
 * through the client connection.
 *
 * Connecting after the mock greeted opens a subordinate connection:
 * its greeting is swallowed, nothing forwards on its own, and
 * `send()` performs a real delivery whose outcome only the handler
 * observes.
 */
export class SmtpServerConnection extends SmtpEventTarget<SmtpServerConnectionEventMap> {
  #session: SmtpSession
  #client: SmtpClientConnection
  #createConnection: () => net.Socket | tls.TLSSocket
  #socket?: net.Socket | tls.TLSSocket
  #connectPromise?: DeferredPromise<void>
  #mode?: 'bypass' | 'subordinate'

  #buffer = Buffer.alloc(0)
  #phaseQueue: Array<SmtpPhase> = []
  #pendingReplies: Array<{
    resolve: (reply: SmtpReply) => void
    reject: (reason: Error) => void
  }> = []
  #preambleSent = false
  #sendQueue: Promise<unknown> = Promise.resolve()
  #closedByClient = false

  constructor(options: SmtpServerConnectionOptions) {
    super()

    this.#session = options.session
    this.#client = options.client
    this.#createConnection = options.createConnection
    this.#client[kSetServer](this)

    options.clientSocket.on('close', () => {
      this.#closedByClient = true
      this.#socket?.destroy()
    })
  }

  /**
   * The role of this connection within the session: "bypass" when it
   * was established before the client was greeted (the real server
   * owns the session voice), "subordinate" when established after the
   * mock greeted (the handler owns what the connection is used for),
   * or undefined until `connect()` settles.
   */
  public get mode(): 'bypass' | 'subordinate' | undefined {
    return this.#mode
  }

  /**
   * The underlying socket connected to the real SMTP server.
   */
  public get socket(): net.Socket | tls.TLSSocket {
    invariant(
      this.#socket,
      'Cannot access "socket" on the server connection: the connection is not open. Did you forget to call "server.connect()"?'
    )

    return this.#socket
  }

  /**
   * Open the connection to the real SMTP server. Resolves once the
   * real server greets the connection; rejects if the destination
   * cannot be reached (e.g. to fall back to mocking a dead host).
   */
  public connect(): Promise<void> {
    if (this.#connectPromise) {
      return this.#connectPromise
    }

    const connectPromise = new DeferredPromise<void>()
    this.#connectPromise = connectPromise

    // The dial failure surfaces through the returned promise alone:
    // a fire-and-forget "connect()" must not crash the process.
    connectPromise.catch(() => {})

    try {
      this.#socket = this.#createConnection()
    } catch (error) {
      connectPromise.reject(error instanceof Error ? error : new Error(String(error)))
      return connectPromise
    }

    this.#socket
      .on('data', (chunk: Buffer) => {
        this.#handleData(chunk)
      })
      .on('error', (error: Error) => {
        connectPromise.reject(error)
        this.#rejectPendingReplies(error)

        if (this.#mode === 'bypass' && !this.#closedByClient) {
          this.#client[kUpstreamError](error)
        }
      })
      .on('end', () => {
        this.#rejectPendingReplies(new Error('Connection closed by the server'))

        if (this.#mode === 'bypass' && !this.#closedByClient) {
          this.#client[kUpstreamEnd]()
        }
      })
      .on('close', () => {
        connectPromise.reject(
          new Error('Connection closed before the server greeting')
        )
        this.#rejectPendingReplies(new Error('Connection closed by the server'))
      })

    return connectPromise
  }

  /**
   * Forward a parsed client frame (a command line, a challenge
   * response, or the message payload) to the real server. Commands
   * carry their phase so the server's reply can be correlated back.
   */
  public [kForwardFrame](frame: Buffer, phase?: SmtpPhase): void {
    if (phase) {
      this.#phaseQueue.push(phase)
    }

    this.#socket?.write(frame)
  }

  /**
   * Perform a real delivery of the given message transaction through
   * this connection. The recorded session preamble (EHLO, AUTH) is
   * replayed on first use, then the transaction envelope and the
   * message are transferred. Resolves with the real server's final
   * verdict; rejects if the destination is unreachable or the real
   * server rejects a replayed phase. Neither outcome reaches the
   * client — the handler authors what the client observes.
   */
  public send(event: SmtpMessageEvent): Promise<SmtpServerMessageEvent> {
    const sendPromise = this.#sendQueue.then(() => {
      return this.#performSend(event)
    })

    // Deliveries queue one after another (RSET in between); a failed
    // delivery must not fail the queued ones.
    this.#sendQueue = sendPromise.catch(() => {})

    return sendPromise
  }

  async #performSend(event: SmtpMessageEvent): Promise<SmtpServerMessageEvent> {
    await this.connect()

    invariant(
      this.#mode !== 'bypass',
      'Failed to call "server.send()": the session is bypassed to the real server, and the client transactions forward to it on their own'
    )

    if (this.#preambleSent) {
      await this.#sendCommand('RSET')
    } else {
      await this.#replayPreamble()
      this.#preambleSent = true
    }

    await this.#replayCommand('sender', `MAIL FROM:<${event.sender}>`)

    let lastRecipientReply: SmtpReply | undefined
    let acceptedRecipients = 0

    for (const recipient of event.recipients) {
      lastRecipientReply = await this.#sendCommand(`RCPT TO:<${recipient}>`)

      if (lastRecipientReply.code < 300) {
        acceptedRecipients += 1
      }
    }

    if (acceptedRecipients === 0) {
      throw new SmtpDeliveryError(
        'recipient',
        lastRecipientReply ?? { code: 554, lines: ['No recipients'] }
      )
    }

    const dataReply = await this.#sendCommand('DATA')

    if (dataReply.code !== 354) {
      throw new SmtpDeliveryError('data', dataReply)
    }

    const verdict = await this.#sendRaw(
      Buffer.concat([applyDotStuffing(event.message), DATA_TERMINATOR])
    )

    return new SmtpServerMessageEvent({
      code: verdict.code,
      lines: verdict.lines,
      queueId: parseQueueId(verdict.lines),
    })
  }

  async #replayPreamble(): Promise<void> {
    await this.#replayCommand(
      'helo',
      `EHLO ${this.#session.heloHostname ?? 'localhost'}`
    )

    const auth = this.#session.auth

    if (auth) {
      const credentials = Buffer.from(
        `\0${auth.username}\0${auth.password}`
      ).toString('base64')

      let authReply = await this.#sendCommand(`AUTH PLAIN ${credentials}`)

      // A server ignoring the inline initial response challenges
      // for the credentials instead.
      if (authReply.code === 334) {
        authReply = await this.#sendCommand(credentials)
      }

      if (authReply.code !== 235) {
        throw new SmtpDeliveryError('auth', authReply)
      }
    }
  }

  #sendCommand(line: string): Promise<SmtpReply> {
    return this.#sendRaw(Buffer.from(`${line}\r\n`))
  }

  /**
   * Send a replayed command, expecting the real server to accept it.
   */
  async #replayCommand(
    phase: SmtpDeliveryError['phase'],
    line: string
  ): Promise<SmtpReply> {
    const reply = await this.#sendCommand(line)

    if (reply.code >= 300) {
      throw new SmtpDeliveryError(phase, reply)
    }

    return reply
  }

  #sendRaw(payload: Buffer): Promise<SmtpReply> {
    return new Promise<SmtpReply>((resolve, reject) => {
      const socket = this.#socket

      if (socket == null || socket.destroyed) {
        reject(new Error('Connection to the server is not open'))
        return
      }

      this.#pendingReplies.push({ resolve, reject })
      socket.write(payload)
    })
  }

  #rejectPendingReplies(reason: Error): void {
    for (const pending of this.#pendingReplies.splice(0)) {
      pending.reject(reason)
    }
  }

  /**
   * Gracefully close the connection to the real server (a TCP FIN).
   * In a bypassed session, the client observes the upstream ending
   * the session, the same as if the real server closed the
   * transmission channel.
   */
  public close(): void {
    this.#socket?.end()
  }

  /**
   * Abruptly terminate the connection to the real server, the way the
   * real server crashing or the network dropping would. In a bypassed
   * session, the client observes a connection error propagated from
   * the upstream.
   */
  public destroy(reason?: Error): void {
    const error =
      reason ??
      Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
        syscall: 'read',
      })

    this.#socket?.destroy(error)
  }

  #handleData(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk])

    // Process synchronously so a forwarded reply is written to the
    // client before the real socket's "end" pushes the EOF. A listener
    // must call "preventDefault()" synchronously to withhold a reply.
    while (true) {
      const reply = this.#extractReply()

      if (reply == null) {
        return
      }

      this.#handleReply(reply)
    }
  }

  #extractReply(): SmtpReply | null {
    const lines: Array<string> = []
    let offset = 0

    while (true) {
      const lineEndIndex = this.#buffer.indexOf(CRLF, offset)

      // The reply is incomplete: wait for the rest of it.
      if (lineEndIndex === -1) {
        return null
      }

      const line = this.#buffer.subarray(offset, lineEndIndex).toString('utf8')
      const separator = line[3]
      lines.push(line.slice(4))
      offset = lineEndIndex + 2

      // A space after the code marks the final line of the reply;
      // a hyphen marks a continuation line of a multiline reply.
      if (separator !== '-') {
        const raw = this.#buffer.subarray(0, offset)
        this.#buffer = this.#buffer.subarray(offset)

        return {
          code: Number.parseInt(line.slice(0, 3), 10),
          lines,
          raw,
        }
      }
    }
  }

  #handleReply(reply: SmtpReply): void {
    // The first reply is always the greeting: the server speaks first.
    // Whether the client already has a voice decides the mode: a
    // greeted client means the mock owns the session and this
    // connection is subordinate (its greeting is swallowed).
    if (this.#mode == null) {
      this.#mode = this.#client[kGreeted] ? 'subordinate' : 'bypass'

      if (this.#mode === 'bypass') {
        const event = new SmtpServerGreetingEvent(reply)
        this.emitter.emit(event)

        if (!event.defaultPrevented) {
          this.#client[kDeliverReply](reply.code, reply.raw)
        }
      }

      this.#connectPromise?.resolve()
      return
    }

    // A subordinate connection is driven by "send()": each reply
    // settles the oldest outstanding command.
    if (this.#mode === 'subordinate') {
      this.#pendingReplies.shift()?.resolve(reply)
      return
    }

    const event = this.#createReplyEvent(reply)

    this.emitter.emit(event)

    // Forward the original reply to the client unless a listener
    // withheld it to author its own reply through the client.
    if (!event.defaultPrevented) {
      this.#client[kDeliverReply](reply.code, reply.raw)
    }
  }

  #createReplyEvent(
    reply: SmtpReply
  ): SmtpServerConnectionEventMap[keyof SmtpServerConnectionEventMap] {
    const data: SmtpServerReplyData = { code: reply.code, lines: reply.lines }
    const pending = this.#phaseQueue[0]

    if (pending == null) {
      return new SmtpServerReplyEventGeneric(data)
    }

    switch (pending.phase) {
      case 'helo': {
        this.#phaseQueue.shift()
        // The first "EHLO" line echoes the domain; the rest are the
        // advertised capabilities. A "HELO" reply is a single line.
        return new SmtpServerHeloEvent({
          ...data,
          capabilities: reply.lines.slice(1),
        })
      }

      case 'auth': {
        // Keep the phase for the intermediate challenges; drop it once
        // the exchange concludes with its final reply.
        if (reply.code !== 334) {
          this.#phaseQueue.shift()
        }
        return new SmtpServerAuthEvent(data)
      }

      case 'sender': {
        this.#phaseQueue.shift()
        return new SmtpServerSenderEvent(data)
      }

      case 'recipient': {
        this.#phaseQueue.shift()
        return new SmtpServerRecipientEvent({
          ...data,
          address: pending.address,
        })
      }

      case 'data': {
        // "354" begins the transfer, so the next reply is the message
        // verdict; any other code rejects "DATA" outright.
        if (reply.code === 354) {
          this.#phaseQueue[0] = { phase: 'message' }
        } else {
          this.#phaseQueue.shift()
        }
        return new SmtpServerDataEvent(data)
      }

      case 'message': {
        this.#phaseQueue.shift()
        return new SmtpServerMessageEvent({
          ...data,
          queueId: parseQueueId(reply.lines),
        })
      }

      case 'quit': {
        this.#phaseQueue.shift()
        return new SmtpServerQuitEvent(data)
      }

      case 'reply': {
        this.#phaseQueue.shift()
        return new SmtpServerReplyEventGeneric(data)
      }
    }
  }
}

/**
 * Parse the queue identifier out of a "queued as <id>" reply text.
 */
function parseQueueId(lines: Array<string>): string | undefined {
  for (const line of lines) {
    const match = line.match(/queued as (\S+)/i)

    if (match != null) {
      return match[1]
    }
  }

  return undefined
}
