import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { DATA_TERMINATOR, undoDotStuffing } from './dot-stuffing'
import { SmtpEventTarget } from './event-target'
import type { SmtpAuthCredentials, SmtpSession } from './smtp-session'
import type { SmtpPhase, SmtpServerConnection } from './smtp-server-connection'
/**
 * Internal symbols wiring the session actors together. They live here,
 * on the client connection — the hub every other module already
 * depends on — so the value imports stay one-directional.
 */
export const kGreeted = Symbol('kGreeted')
export const kActivate = Symbol('kActivate')
export const kDetach = Symbol('kDetach')
export const kSetServer = Symbol('kSetServer')
export const kDeliverReply = Symbol('kDeliverReply')
export const kUpstreamEnd = Symbol('kUpstreamEnd')
export const kUpstreamError = Symbol('kUpstreamError')
export const kForwardFrame = Symbol('kForwardFrame')

const SMTP_DOMAIN = 'mock.example.com'
const DEFAULT_CAPABILITIES = ['AUTH PLAIN LOGIN', '8BITMIME', 'SMTPUTF8']

const BASE64_USERNAME_CHALLENGE = 'VXNlcm5hbWU6'
const BASE64_PASSWORD_CHALLENGE = 'UGFzc3dvcmQ6'

export type SmtpTransientErrorCode = 421 | 432 | 450 | 451 | 452 | 454 | 455

export type SmtpPermanentErrorCode =
  | 500
  | 501
  | 502
  | 503
  | 504
  | 530
  | 534
  | 535
  | 538
  | 550
  | 551
  | 552
  | 553
  | 554
  | 555

export type SmtpRejectionCode = SmtpTransientErrorCode | SmtpPermanentErrorCode

export type SmtpReplyCode =
  211 | 214 | 220 | 221 | 235 | 250 | 251 | 252 | 334 | 354 | SmtpRejectionCode

/**
 * The reply codes a server may greet the connection with:
 * "220" (service ready), "554" (connection rejected; the server
 * then only accepts "QUIT"), or "421" (service not available).
 * @see https://datatracker.ietf.org/doc/html/rfc5321#section-3.1
 */
export type SmtpGreetingCode = 220 | 421 | 554

export interface SmtpGreeting {
  /**
   * The greeting reply code (default "220").
   */
  code?: SmtpGreetingCode
  /**
   * The greeting reply text.
   */
  message?: string
}

/**
 * The reply channel given to each command event. Replying through
 * the context marks the command as handled so the connection knows
 * not to apply the default (a mock reply or the forwarding to the
 * real server), and stops the event's propagation so the first
 * verdict wins.
 */
interface SmtpCommandContext {
  isReplied: boolean
  event?: { stopImmediatePropagation: () => void }
  reply: (code: SmtpReplyCode, message: string) => void
  replyMultiline: (code: SmtpReplyCode, lines: Array<string>) => void
}

interface SmtpHeloEventData {
  verb: 'HELO' | 'EHLO'
  hostname: string
}

export class SmtpHeloEvent extends TypedEvent<SmtpHeloEventData, void, 'helo'> {
  public verb: 'HELO' | 'EHLO'
  public hostname: string
  #context: SmtpCommandContext

  constructor(data: SmtpHeloEventData, context: SmtpCommandContext) {
    super('helo', { data })

    this.verb = data.verb
    this.hostname = data.hostname
    this.#context = context
    context.event = this
  }

  public accept(options?: { capabilities?: Array<string> }): void {
    if (this.verb === 'HELO') {
      this.#context.reply(250, SMTP_DOMAIN)
      return
    }

    const capabilities = options?.capabilities ?? DEFAULT_CAPABILITIES
    this.#context.replyMultiline(250, [SMTP_DOMAIN, ...capabilities])
  }

  public reject(options?: {
    code?: SmtpPermanentErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 550,
      `5.7.1 ${options?.reason ?? 'Access denied'}`
    )
  }
}

interface SmtpAuthEventData {
  method: 'PLAIN' | 'LOGIN'
  username: string
  password: string
}

/**
 * The client authenticating itself ("AUTH", RFC 4954).
 * The connection runs the challenge/response exchange of the chosen
 * mechanism and emits this event once the credentials are collected.
 */
export class SmtpAuthEvent extends TypedEvent<
  SmtpAuthEventData,
  void,
  'auth'
> {
  /**
   * The authentication mechanism chosen by the client.
   */
  public method: 'PLAIN' | 'LOGIN'
  public username: string
  public password: string
  #context: SmtpCommandContext

  constructor(data: SmtpAuthEventData, context: SmtpCommandContext) {
    super('auth', { data })

    this.method = data.method
    this.username = data.username
    this.password = data.password
    this.#context = context
    context.event = this
  }

  /**
   * Accept the credentials. The client observes a successful
   * authentication and proceeds with the session.
   */
  public accept(): void {
    this.#context.reply(235, '2.7.0 Authentication successful')
  }

  /**
   * Reject the credentials permanently. The client observes an
   * authentication failure it must not retry with the same
   * credentials (e.g. a wrong password).
   */
  public reject(options?: {
    code?: SmtpPermanentErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 535,
      `5.7.8 ${options?.reason ?? 'Authentication credentials invalid'}`
    )
  }

  /**
   * Defer the authentication. The client observes a transient
   * failure it may retry later (e.g. the authentication backend
   * being temporarily unavailable).
   */
  public defer(options?: {
    code?: SmtpTransientErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 454,
      `4.7.0 ${options?.reason ?? 'Temporary authentication failure, try again later'}`
    )
  }
}

interface SmtpSenderEventData {
  address: string
  parameters: Record<string, string | true>
}

/**
 * The sender of the email transaction ("MAIL FROM").
 * A validation hook: reject it to refuse the whole transaction
 * before the client gets to name any recipients.
 */
export class SmtpSenderEvent extends TypedEvent<
  SmtpSenderEventData,
  void,
  'sender'
> {
  public address: string
  /**
   * The ESMTP parameters of the command (e.g. "SIZE=1024").
   */
  public parameters: Record<string, string | true>
  #context: SmtpCommandContext

  constructor(data: SmtpSenderEventData, context: SmtpCommandContext) {
    super('sender', { data })

    this.address = data.address
    this.parameters = data.parameters
    this.#context = context
    context.event = this
  }

  public accept(): void {
    this.#context.reply(250, '2.1.0 Ok')
  }

  /**
   * Reject the sender permanently. The client observes a failed
   * transaction it must not retry.
   */
  public reject(options?: {
    code?: SmtpPermanentErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 550,
      `5.1.0 ${options?.reason ?? 'Sender rejected'}`
    )
  }

  /**
   * Defer the sender. The client observes a transient
   * failure it may retry later (e.g. greylisting).
   */
  public defer(options?: {
    code?: SmtpTransientErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 451,
      `4.3.0 ${options?.reason ?? 'Temporary local problem, try again later'}`
    )
  }
}

interface SmtpRecipientEventData {
  address: string
}

/**
 * A single recipient of the email transaction ("RCPT TO").
 *
 * @note Recipients arrive one at a time: the client names each
 * recipient in its own command and awaits its individual verdict
 * (that is how partial delivery works — some recipients accepted,
 * others rejected). The server cannot know how many recipients will
 * follow until the client starts the message transfer, which is why
 * recipients cannot be batched into a single decision event. For the
 * complete list, see the "message" event of the finished transaction.
 */
export class SmtpRecipientEvent extends TypedEvent<
  SmtpRecipientEventData,
  void,
  'recipient'
> {
  public address: string
  #context: SmtpCommandContext

  constructor(data: SmtpRecipientEventData, context: SmtpCommandContext) {
    super('recipient', { data })

    this.address = data.address
    this.#context = context
    context.event = this
  }

  public accept(): void {
    this.#context.reply(250, '2.1.5 Ok')
  }

  /**
   * Reject this recipient permanently. The client observes a bounced
   * recipient it must not retry (e.g. no such user).
   */
  public reject(options?: {
    code?: SmtpPermanentErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 550,
      `5.1.1 ${options?.reason ?? 'Mailbox unavailable'}`
    )
  }

  /**
   * Defer this recipient. The client observes a transient
   * failure it may retry later (e.g. greylisting, mailbox busy).
   */
  public defer(options?: {
    code?: SmtpTransientErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 450,
      `4.2.1 ${options?.reason ?? 'Mailbox busy, try again later'}`
    )
  }
}

export class SmtpDataEvent extends TypedEvent<void, void, 'data'> {
  #context: SmtpCommandContext

  constructor(context: SmtpCommandContext) {
    super('data')

    this.#context = context
    context.event = this
  }

  public accept(): void {
    this.#context.reply(354, 'End data with <CR><LF>.<CR><LF>')
  }

  public reject(options?: { code?: SmtpRejectionCode; reason?: string }): void {
    this.#context.reply(
      options?.code ?? 554,
      `5.5.1 ${options?.reason ?? 'No valid recipients'}`
    )
  }
}

interface SmtpMessageEventData {
  sender: string
  recipients: Array<string>
  message: Buffer
}

/**
 * The complete email transaction: the sender, the accepted
 * recipients, and the transferred message. This is the encompassing
 * event for asserting on sent emails; listen to the "sender" and
 * "recipient" events only when individual envelope verdicts
 * are needed.
 */
export class SmtpMessageEvent extends TypedEvent<
  SmtpMessageEventData,
  void,
  'message'
> {
  /**
   * The sender address of this transaction ("MAIL FROM").
   */
  public sender: string
  /**
   * The accepted recipients of this transaction ("RCPT TO").
   */
  public recipients: Array<string>
  /**
   * The complete message (headers and body) received from the client,
   * with the SMTP dot-stuffing already undone.
   */
  public message: Buffer
  #context: SmtpCommandContext

  constructor(data: SmtpMessageEventData, context: SmtpCommandContext) {
    super('message', { data })

    this.sender = data.sender
    this.recipients = data.recipients
    this.message = data.message
    this.#context = context
    context.event = this
  }

  /**
   * Accept the message for delivery.
   *
   * @note The optional queue identifier is echoed in the reply text
   * ("250 2.0.0 Ok: queued as <id>"). It has no protocol meaning and
   * evokes no client reaction: the client only exposes the reply
   * verbatim (e.g. "info.response" in Nodemailer), which applications
   * sometimes parse for correlation with the provider.
   */
  public accept(options?: { queueId?: string }): void {
    const queuedAs = options?.queueId ? `: queued as ${options.queueId}` : ''
    this.#context.reply(250, `2.0.0 Ok${queuedAs}`)
  }

  /**
   * Reject the message permanently. The client observes a bounced
   * message it must not retry (e.g. a content policy rejection,
   * or the message being too large).
   */
  public reject(options?: {
    code?: SmtpPermanentErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 554,
      `5.6.0 ${options?.reason ?? 'Message rejected'}`
    )
  }

  /**
   * Defer the message. The client observes a transient
   * failure it may retry later (e.g. a full mailbox or a busy server).
   */
  public defer(options?: {
    code?: SmtpTransientErrorCode
    reason?: string
  }): void {
    this.#context.reply(
      options?.code ?? 451,
      `4.3.0 ${options?.reason ?? 'Temporary local problem, try again later'}`
    )
  }
}

export class SmtpQuitEvent extends TypedEvent<void, void, 'quit'> {
  #context: SmtpCommandContext

  constructor(context: SmtpCommandContext) {
    super('quit')

    this.#context = context
    context.event = this
  }

  public reply(code: SmtpReplyCode, message: string): void {
    this.#context.reply(code, message)
  }
}

interface SmtpUnknownCommandEventData {
  line: string
  verb: string
}

export class SmtpUnknownCommandEvent extends TypedEvent<
  SmtpUnknownCommandEventData,
  void,
  'unknown-command'
> {
  /**
   * The raw command line as sent by the client.
   */
  public line: string
  public verb: string
  #context: SmtpCommandContext

  constructor(data: SmtpUnknownCommandEventData, context: SmtpCommandContext) {
    super('unknown-command', { data })

    this.line = data.line
    this.verb = data.verb
    this.#context = context
    context.event = this
  }

  public reply(code: SmtpReplyCode, message: string): void {
    this.#context.reply(code, message)
  }
}

type SmtpClientConnectionEventMap = {
  helo: SmtpHeloEvent
  auth: SmtpAuthEvent
  sender: SmtpSenderEvent
  recipient: SmtpRecipientEvent
  data: SmtpDataEvent
  message: SmtpMessageEvent
  quit: SmtpQuitEvent
  'unknown-command': SmtpUnknownCommandEvent
}

interface PendingAuth {
  method: 'PLAIN' | 'LOGIN'
  username?: string
}

type PendingVerdict =
  | { type: 'sender'; address: string }
  | { type: 'recipient'; address: string }
  | { type: 'auth'; credentials: SmtpAuthCredentials }

interface SmtpClientConnectionOptions {
  session: SmtpSession
  socket: net.Socket | tls.TLSSocket
}

interface SmtpEnvelope {
  sender: string
  recipients: Array<string>
}

/**
 * The intercepted side of an SMTP session: the client (the
 * application under test) and the replies it observes.
 *
 * The connection parses the client commands and emits an event per
 * command in every mode. Each event exposes methods to handle that
 * particular command (e.g. "accept()"/"reject()"); the first reply
 * wins and stops the event's propagation. Commands nobody replied to
 * receive the default: a sensible mock reply, or, when the session is
 * bypassed to the real server, the forwarding of the command as-is.
 *
 * The "message" event describes the complete email transaction
 * (sender, accepted recipients, message) and is the only event most
 * consumers need.
 */
export class SmtpClientConnection extends SmtpEventTarget<SmtpClientConnectionEventMap> {
  #session: SmtpSession
  #socket: net.Socket | tls.TLSSocket
  #server?: SmtpServerConnection
  /**
   * @note The incoming bytes stay a Buffer until a complete line or
   * message is extracted. Decoding arbitrary chunks would corrupt
   * multibyte characters split across packet boundaries.
   */
  #buffer = Buffer.alloc(0)
  #envelope: SmtpEnvelope = { sender: '', recipients: [] }
  #pendingAuth?: PendingAuth
  #pendingVerdict?: PendingVerdict
  #activeContext?: SmtpCommandContext
  #greeted = false
  #active = false
  #expectContinuation = false
  #isReadingData = false
  #isProcessing = false

  constructor(options: SmtpClientConnectionOptions) {
    super()

    this.#session = options.session
    this.#socket = options.socket
    this.#socket.on('data', this.#handleData)
  }

  /**
   * @note The incoming bytes are buffered from the start but parsed
   * only once the session's fate is decided (see the "activate"
   * below). A session listener may yet pass the connection through
   * raw (non-SMTP traffic), and the parser replying to such traffic
   * would corrupt it.
   */
  #handleData = (chunk: Buffer): void => {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    void this.#processBuffer()
  }

  /**
   * Start parsing the client commands. Called once the session is
   * claimed as an SMTP session.
   */
  public [kActivate](): void {
    this.#active = true
    void this.#processBuffer()
  }

  /**
   * Withdraw from the connection entirely: the session was passed
   * through raw and none of its bytes are SMTP.
   */
  public [kDetach](): void {
    this.#socket.off('data', this.#handleData)
    this.#buffer = Buffer.alloc(0)
  }

  public get [kGreeted](): boolean {
    return this.#greeted
  }

  public [kSetServer](server: SmtpServerConnection): void {
    this.#server = server
  }

  /**
   * Deliver a reply authored elsewhere (e.g. a forwarded reply of the
   * real server) to the client, tracking the session state the reply
   * implies the same way locally authored replies do.
   */
  public [kDeliverReply](code: number, raw: Buffer): void {
    this.#deliverReply(code, raw)
  }

  /**
   * The real server ended the session: signal the end-of-stream
   * to the client.
   */
  public [kUpstreamEnd](): void {
    this.#socket.end()
  }

  /**
   * The real server connection errored: propagate the error onto
   * the client connection.
   */
  public [kUpstreamError](error: Error): void {
    this.#socket.destroy(error)
  }

  /**
   * Greet the client, opening the SMTP session. The server speaks
   * first: SMTP clients send nothing until they receive the greeting.
   * Pass a custom greeting to change the reply (e.g. "554" to reject
   * the connection), or "null" to send nothing and exercise the
   * client's greeting timeout.
   */
  public greet(greeting?: SmtpGreeting | null): void {
    this.#greeted = true

    // An explicit "null" greeting sends nothing so the client's
    // greeting timeout can kick in.
    if (greeting === null) {
      return
    }

    this.reply(greeting?.code ?? 220, greeting?.message ?? `${SMTP_DOMAIN} ESMTP`)
  }

  /**
   * Send a reply line to the SMTP client.
   */
  public reply(code: SmtpReplyCode, message: string): void {
    this.#deliverReply(code, Buffer.from(`${code} ${message}\r\n`))
  }

  /**
   * Abort the SMTP session the way the protocol allows: reply with
   * "421" and close the transmission channel. "421" is the only reply
   * code a server may send at any moment of the session (e.g. on
   * shutdown or resource exhaustion) before closing the connection.
   * The client observes a graceful, protocol-level session abort.
   * @see https://datatracker.ietf.org/doc/html/rfc5321#section-3.8
   */
  public abort(
    message = '4.3.0 Service not available, closing transmission channel'
  ): void {
    this.reply(421, message)
    this.#socket.end()
  }

  /**
   * Error the connection abruptly, without any SMTP reply, the way a
   * server crash or a broken network would. The client observes a
   * connection error in the middle of the session.
   */
  public error(reason?: Error): void {
    const error =
      reason ??
      Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
        syscall: 'read',
      })

    this.#socket.destroy(error)
  }

  get #isForwarding(): boolean {
    return this.#server?.mode === 'bypass'
  }

  /**
   * Deliver a complete reply to the client and track the session state
   * it implies: the first delivered reply is the greeting, "334"
   * prompts a continuation line, "354" begins the message transfer,
   * and a success code settles the pending envelope/identity verdict.
   * Every reply — mock-authored or forwarded from the real server —
   * goes through here, so the state tracking is mode-agnostic.
   */
  #deliverReply(code: number, raw: Buffer): void {
    this.#greeted = true
    this.#socket.write(raw)

    // A "334" challenge — whoever authored it — makes the client's
    // next line an authentication response, not a command.
    if (code === 334) {
      this.#expectContinuation = true
    }

    if (code === 354) {
      this.#isReadingData = true
    }

    const verdict = this.#pendingVerdict

    if (verdict != null) {
      this.#pendingVerdict = undefined

      if (code < 300) {
        switch (verdict.type) {
          case 'sender': {
            this.#envelope.sender = verdict.address
            break
          }

          case 'recipient': {
            this.#envelope.recipients.push(verdict.address)
            break
          }

          case 'auth': {
            this.#session.user = verdict.credentials.username
            this.#session.auth = verdict.credentials
            break
          }
        }
      }
    }
  }

  #forwardLine(line: string, phase?: SmtpPhase): void {
    this.#server![kForwardFrame](Buffer.from(`${line}\r\n`), phase)
  }

  /**
   * Conclude a command nobody replied to: forward it to the real
   * server of a bypassed session, or apply the mock default.
   */
  #concludeCommand(
    context: SmtpCommandContext,
    line: string,
    phase: SmtpPhase,
    applyDefault: () => void
  ): void {
    if (context.isReplied) {
      return
    }

    if (this.#isForwarding) {
      this.#forwardLine(line, phase)
      return
    }

    applyDefault()
  }

  #createCommandContext(): SmtpCommandContext {
    const markReplied = () => {
      context.isReplied = true
      context.event?.stopImmediatePropagation()
    }

    const context: SmtpCommandContext = {
      isReplied: false,
      reply: (code, message) => {
        markReplied()
        this.reply(code, message)
      },
      replyMultiline: (code, lines) => {
        markReplied()

        const raw = lines
          .map((currentLine, index) => {
            const separator = index === lines.length - 1 ? ' ' : '-'
            return `${code}${separator}${currentLine}\r\n`
          })
          .join('')

        this.#deliverReply(code, Buffer.from(raw))
      },
    }

    this.#activeContext = context
    return context
  }

  /**
   * Translate an exception thrown from a command listener onto the
   * session the same way a real server surfaces its internal errors:
   * reply "451" ("local error in processing", RFC 5321) to the
   * in-flight command and keep the session going. If the reply for
   * that command already went out, a crash can only manifest as an
   * abrupt connection error.
   */
  #handleListenerError(): void {
    if (this.#activeContext?.isReplied) {
      this.error()
      return
    }

    this.reply(451, '4.3.0 Local error in processing')
  }

  #resetEnvelope(): void {
    this.#envelope = { sender: '', recipients: [] }
  }

  async #processBuffer(): Promise<void> {
    if (!this.#active || this.#isProcessing) {
      return
    }

    this.#isProcessing = true

    try {
      while (true) {
        if (this.#isReadingData) {
          const terminatorIndex = this.#buffer.indexOf(DATA_TERMINATOR)

          if (terminatorIndex === -1) {
            return
          }

          const rawMessage = this.#buffer.subarray(0, terminatorIndex)
          this.#buffer = this.#buffer.subarray(
            terminatorIndex + DATA_TERMINATOR.length
          )
          this.#isReadingData = false

          try {
            await this.#handleMessage(rawMessage)
          } catch {
            this.#handleListenerError()
          }

          continue
        }

        const lineEndIndex = this.#buffer.indexOf('\r\n')

        if (lineEndIndex === -1) {
          return
        }

        // Command lines are always complete at this point,
        // so decoding them cannot split multibyte characters.
        const line = this.#buffer.subarray(0, lineEndIndex).toString('utf8')
        this.#buffer = this.#buffer.subarray(lineEndIndex + 2)

        try {
          if (this.#expectContinuation) {
            this.#expectContinuation = false
            await this.#handleAuthResponse(line)
          } else {
            await this.#handleCommand(line)
          }
        } catch {
          this.#handleListenerError()
        }
      }
    } finally {
      this.#isProcessing = false
    }
  }

  async #handleCommand(line: string): Promise<void> {
    const command = line.toUpperCase()

    if (command.startsWith('EHLO') || command.startsWith('HELO')) {
      const context = this.#createCommandContext()
      const event = new SmtpHeloEvent(
        {
          verb: command.startsWith('EHLO') ? 'EHLO' : 'HELO',
          hostname: line.slice('EHLO '.length).trim(),
        },
        context
      )
      this.#session.heloHostname = event.hostname
      await this.emitter.emitAsPromise(event)

      this.#concludeCommand(context, line, { phase: 'helo' }, () => {
        event.accept()
      })

      return
    }

    if (command.startsWith('AUTH')) {
      await this.#handleAuth(line)
      return
    }

    if (command.startsWith('MAIL FROM:')) {
      const context = this.#createCommandContext()
      const event = new SmtpSenderEvent(
        parseAddressCommand(line.slice('MAIL FROM:'.length)),
        context
      )
      this.#pendingVerdict = { type: 'sender', address: event.address }
      await this.emitter.emitAsPromise(event)

      this.#concludeCommand(context, line, { phase: 'sender' }, () => {
        event.accept()
      })

      return
    }

    if (command.startsWith('RCPT TO:')) {
      const context = this.#createCommandContext()
      const event = new SmtpRecipientEvent(
        parseAddressCommand(line.slice('RCPT TO:'.length)),
        context
      )
      this.#pendingVerdict = { type: 'recipient', address: event.address }
      await this.emitter.emitAsPromise(event)

      this.#concludeCommand(
        context,
        line,
        { phase: 'recipient', address: event.address },
        () => {
          event.accept()
        }
      )

      return
    }

    if (command.startsWith('DATA')) {
      const context = this.#createCommandContext()
      const event = new SmtpDataEvent(context)
      await this.emitter.emitAsPromise(event)

      this.#concludeCommand(context, line, { phase: 'data' }, () => {
        /**
         * @note A message transfer without any accepted recipients
         * must be refused (there is nobody to deliver the message to).
         * @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.1.1.4
         */
        if (this.#envelope.recipients.length === 0) {
          event.reject()
        } else {
          event.accept()
        }
      })

      return
    }

    if (command.startsWith('QUIT')) {
      const context = this.#createCommandContext()
      const event = new SmtpQuitEvent(context)
      await this.emitter.emitAsPromise(event)

      // A forwarded "QUIT" is answered and closed by the real server,
      // and that closure propagates to the client on its own.
      if (!context.isReplied && this.#isForwarding) {
        this.#forwardLine(line, { phase: 'quit' })
        return
      }

      if (!context.isReplied) {
        this.reply(221, '2.0.0 Bye')
      }

      this.#socket.end()
      return
    }

    if (command.startsWith('RSET') || command.startsWith('NOOP')) {
      // Resetting aborts the ongoing transaction, if any.
      if (command.startsWith('RSET')) {
        this.#resetEnvelope()
      }

      this.#replyOrForward(line, { phase: 'reply' }, 250, '2.0.0 Ok')
      return
    }

    const context = this.#createCommandContext()
    const event = new SmtpUnknownCommandEvent(
      {
        line,
        verb: command.split(' ')[0],
      },
      context
    )
    await this.emitter.emitAsPromise(event)

    this.#concludeCommand(context, line, { phase: 'reply' }, () => {
      event.reply(500, '5.5.2 Command not recognized')
    })
  }

  /**
   * Reply to the client (a mocked session) or forward the line to the
   * real server (a bypassed session), which then replies in its stead.
   */
  #replyOrForward(
    line: string,
    phase: SmtpPhase | undefined,
    code: SmtpReplyCode,
    message: string
  ): void {
    if (this.#isForwarding) {
      this.#forwardLine(line, phase)
    } else {
      this.reply(code, message)
    }
  }

  /**
   * The default conclusion of an "auth" event nobody replied to:
   * accept the credentials (a mocked session) or forward the line that
   * completed the exchange (a bypassed session).
   */
  #authDefault(line: string, phase?: SmtpPhase): (event: SmtpAuthEvent) => void {
    return (event) => {
      if (this.#isForwarding) {
        this.#forwardLine(line, phase)
      } else {
        event.accept()
      }
    }
  }

  /**
   * Handle the "AUTH" command, collecting the credentials of the
   * challenge/response exchange of the chosen mechanism. A mocked
   * session authors the challenges itself; a bypassed session forwards
   * the exchange and lets the real server drive it, while still
   * parsing the responses to reconstruct the credentials.
   * @see https://datatracker.ietf.org/doc/html/rfc4954
   */
  async #handleAuth(line: string): Promise<void> {
    // Split the raw line: the initial response is base64 (case-sensitive).
    const [, mechanism = '', initialResponse] = line.split(' ')
    const method = mechanism.toUpperCase()

    // "AUTH PLAIN <base64>" carries the credentials inline.
    if (method === 'PLAIN' && initialResponse) {
      await this.#emitAuth(
        parsePlainCredentials(initialResponse),
        this.#authDefault(line, { phase: 'auth' })
      )
      return
    }

    // "AUTH PLAIN" alone awaits the credentials as the response
    // to an empty server challenge.
    if (method === 'PLAIN') {
      this.#pendingAuth = { method }
      this.#replyOrForward(line, { phase: 'auth' }, 334, '')
      return
    }

    // "AUTH LOGIN <base64>" carries the username inline,
    // proceed to the password challenge right away.
    if (method === 'LOGIN') {
      this.#pendingAuth = initialResponse
        ? { method, username: decodeBase64(initialResponse) }
        : { method }

      this.#replyOrForward(
        line,
        { phase: 'auth' },
        334,
        this.#pendingAuth.username == null
          ? BASE64_USERNAME_CHALLENGE
          : BASE64_PASSWORD_CHALLENGE
      )
      return
    }

    this.#replyOrForward(
      line,
      { phase: 'auth' },
      504,
      '5.5.4 Unrecognized authentication type'
    )
  }

  /**
   * Handle the response to a "334" challenge (an authentication
   * exchange line, not a command).
   */
  async #handleAuthResponse(line: string): Promise<void> {
    const pendingAuth = this.#pendingAuth

    // The client may abort the exchange at any point by sending "*".
    // A response to an unrecognized exchange (e.g. a mechanism only
    // the real server supports) has no credentials to collect.
    if (pendingAuth == null || line === '*') {
      this.#pendingAuth = undefined
      this.#replyOrForward(line, undefined, 501, '5.7.0 Authentication aborted')
      return
    }

    if (pendingAuth.method === 'PLAIN') {
      this.#pendingAuth = undefined
      await this.#emitAuth(parsePlainCredentials(line), this.#authDefault(line))
      return
    }

    if (pendingAuth.username == null) {
      pendingAuth.username = decodeBase64(line)
      this.#replyOrForward(line, undefined, 334, BASE64_PASSWORD_CHALLENGE)
      return
    }

    this.#pendingAuth = undefined
    await this.#emitAuth(
      {
        method: 'LOGIN',
        username: pendingAuth.username,
        password: decodeBase64(line),
      },
      this.#authDefault(line)
    )
  }

  async #emitAuth(
    credentials: SmtpAuthEventData,
    applyDefault: (event: SmtpAuthEvent) => void
  ): Promise<void> {
    const context = this.#createCommandContext()
    const event = new SmtpAuthEvent(credentials, context)

    // Record the identity once the credentials are accepted,
    // whether by a local verdict or by the real server.
    this.#pendingVerdict = { type: 'auth', credentials }

    await this.emitter.emitAsPromise(event)

    if (!context.isReplied) {
      applyDefault(event)
    }
  }

  async #handleMessage(rawMessage: Buffer): Promise<void> {
    const context = this.#createCommandContext()
    const event = new SmtpMessageEvent(
      {
        sender: this.#envelope.sender,
        recipients: this.#envelope.recipients,
        message: undoDotStuffing(rawMessage),
      },
      context
    )

    // A finished message transfer concludes the transaction.
    // The client may start another one on the same connection.
    this.#resetEnvelope()

    await this.emitter.emitAsPromise(event)

    if (context.isReplied) {
      return
    }

    if (this.#isForwarding) {
      this.#server![kForwardFrame](Buffer.concat([rawMessage, DATA_TERMINATOR]))
      return
    }

    event.accept()
  }
}

function parseAddressCommand(input: string): {
  address: string
  parameters: Record<string, string | true>
} {
  const address = input.match(/<([^>]*)>/)?.[1] ?? ''
  const parametersInput = input.slice(input.indexOf('>') + 1).trim()
  const parameters: Record<string, string | true> = {}

  if (parametersInput.length > 0) {
    for (const parameter of parametersInput.split(/\s+/)) {
      const [name, value] = parameter.split('=')
      parameters[name] = value ?? true
    }
  }

  return { address, parameters }
}

function decodeBase64(input: string): string {
  return Buffer.from(input, 'base64').toString('utf8')
}

/**
 * Parse the credentials of the "PLAIN" authentication mechanism:
 * a base64-encoded "[authzid]\0username\0password" string.
 * @see https://datatracker.ietf.org/doc/html/rfc4616
 */
function parsePlainCredentials(input: string): {
  method: 'PLAIN'
  username: string
  password: string
} {
  const [, username = '', password = ''] = decodeBase64(input).split('\0')

  return { method: 'PLAIN', username, password }
}

