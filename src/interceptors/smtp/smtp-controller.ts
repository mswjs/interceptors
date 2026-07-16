import net from 'node:net'
import tls from 'node:tls'
import { Emitter, TypedEvent } from 'rettime'
import type {
  TcpSocketController,
  TlsSocketController,
} from '../net/socket-controller'

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

export type SmtpGreeting =
  /**
   * The text of the default "220" greeting.
   */
  | string
  /**
   * Do not greet the connection at all
   * (e.g. to test the client's greeting timeout).
   */
  | false
  /**
   * The complete greeting reply.
   */
  | { code?: SmtpGreetingCode; message?: string }

/**
 * The reply channel given to each command event. Replying through
 * the context marks the command as handled so the controller knows
 * not to apply the default reply, and records the reply code so the
 * controller can track the transaction state (e.g. which recipients
 * were accepted).
 */
interface SmtpCommandContext {
  isReplied: boolean
  repliedCode?: SmtpReplyCode
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
 * The controller runs the challenge/response exchange of the chosen
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

interface SmtpDataContext extends SmtpCommandContext {
  beginMessage: () => void
}

export class SmtpDataEvent extends TypedEvent<void, void, 'data'> {
  #context: SmtpDataContext

  constructor(context: SmtpDataContext) {
    super('data')

    this.#context = context
  }

  public accept(): void {
    this.#context.beginMessage()
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
  'command'
> {
  /**
   * The raw command line as sent by the client.
   */
  public line: string
  public verb: string
  #context: SmtpCommandContext

  constructor(data: SmtpUnknownCommandEventData, context: SmtpCommandContext) {
    super('command', { data })

    this.line = data.line
    this.verb = data.verb
    this.#context = context
  }

  public reply(code: SmtpReplyCode, message: string): void {
    this.#context.reply(code, message)
  }
}

type SmtpControllerEventMap = {
  helo: SmtpHeloEvent
  auth: SmtpAuthEvent
  sender: SmtpSenderEvent
  recipient: SmtpRecipientEvent
  data: SmtpDataEvent
  message: SmtpMessageEvent
  quit: SmtpQuitEvent
  command: SmtpUnknownCommandEvent
}

type PendingAuth =
  { method: 'PLAIN' } | { method: 'LOGIN'; username?: string }

interface SmtpControllerOptions {
  socket: net.Socket | tls.TLSSocket
  socketController: TcpSocketController | TlsSocketController
}

interface SmtpEnvelope {
  sender: string
  recipients: Array<string>
}

/**
 * Controls a single SMTP connection.
 *
 * Once claimed, the controller runs a mock SMTP server session:
 * it sends the greeting, parses the client commands, and emits an
 * event per command. Each event exposes methods to handle that
 * particular command (e.g. "accept()"/"reject()"). Commands without
 * listeners (or whose listeners did not reply) are accepted with
 * sensible defaults, so only the commands you care about need handling.
 *
 * The "message" event describes the complete email transaction
 * (sender, accepted recipients, message) and is the only event most
 * consumers need.
 */
export class SmtpController extends Emitter<SmtpControllerEventMap> {
  #socket: net.Socket | tls.TLSSocket
  #socketController: TcpSocketController | TlsSocketController
  #buffer = ''
  #envelope: SmtpEnvelope = { sender: '', recipients: [] }
  #pendingAuth?: PendingAuth
  #activeContext?: SmtpCommandContext
  #isReadingData = false
  #isProcessing = false

  constructor(options: SmtpControllerOptions) {
    super()

    this.#socket = options.socket
    this.#socketController = options.socketController
  }

  /**
   * Establish this connection as-is, against the actual server.
   */
  public passthrough(): void {
    this.#socketController.passthrough()
  }

  /**
   * Claim this connection, mocking the SMTP server.
   * The mock server speaks first: SMTP clients send nothing until
   * they receive the server's "220" greeting.
   */
  public claim(options?: { greeting?: SmtpGreeting }): void {
    this.#socketController.claim()

    this.#socket.on('data', (chunk) => {
      this.#buffer += chunk.toString()
      void this.#processBuffer()
    })

    const greeting = options?.greeting

    // Stay silent so the client's greeting timeout can kick in.
    if (greeting === false) {
      return
    }

    if (typeof greeting === 'object') {
      this.reply(
        greeting.code ?? 220,
        greeting.message ?? `${SMTP_DOMAIN} ESMTP`
      )
      return
    }

    this.reply(220, greeting ?? `${SMTP_DOMAIN} ESMTP`)
  }

  /**
   * Send a reply line to the SMTP client.
   */
  public reply(code: SmtpReplyCode, message: string): void {
    this.#socket.write(`${code} ${message}\r\n`)
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

  #replyMultiline(code: SmtpReplyCode, lines: Array<string>): void {
    for (let index = 0; index < lines.length; index++) {
      const separator = index === lines.length - 1 ? ' ' : '-'
      this.#socket.write(`${code}${separator}${lines[index]}\r\n`)
    }
  }

  #createCommandContext(): SmtpCommandContext {
    const context: SmtpCommandContext = {
      isReplied: false,
      reply: (code, message) => {
        context.isReplied = true
        context.repliedCode = code
        this.reply(code, message)
      },
      replyMultiline: (code, lines) => {
        context.isReplied = true
        context.repliedCode = code
        this.#replyMultiline(code, lines)
      },
    }

    this.#activeContext = context
    return context
  }

  /**
   * Translate an exception thrown from a session listener onto the
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
    if (this.#isProcessing) {
      return
    }

    this.#isProcessing = true

    try {
      while (true) {
        if (this.#isReadingData) {
          const terminatorIndex = this.#buffer.indexOf('\r\n.\r\n')

          if (terminatorIndex === -1) {
            return
          }

          const rawMessage = this.#buffer.slice(0, terminatorIndex)
          this.#buffer = this.#buffer.slice(terminatorIndex + 5)
          this.#isReadingData = false

          try {
            await this.#handleMessage(rawMessage)
          } catch (error) {
            this.#handleListenerError()
          }

          continue
        }

        const lineEndIndex = this.#buffer.indexOf('\r\n')

        if (lineEndIndex === -1) {
          return
        }

        const line = this.#buffer.slice(0, lineEndIndex)
        this.#buffer = this.#buffer.slice(lineEndIndex + 2)

        try {
          // Lines sent during an authentication exchange are the
          // challenge responses, not commands.
          if (this.#pendingAuth) {
            await this.#handleAuthResponse(line)
          } else {
            await this.#handleCommand(line)
          }
        } catch (error) {
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
      await this.emitAsPromise(event)

      if (!context.isReplied) {
        event.accept()
      }

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
      await this.emitAsPromise(event)

      if (!context.isReplied) {
        event.accept()
      }

      if (isAcceptedReply(context)) {
        this.#envelope.sender = event.address
      }

      return
    }

    if (command.startsWith('RCPT TO:')) {
      const context = this.#createCommandContext()
      const event = new SmtpRecipientEvent(
        parseAddressCommand(line.slice('RCPT TO:'.length)),
        context
      )
      await this.emitAsPromise(event)

      if (!context.isReplied) {
        event.accept()
      }

      // Only the accepted recipients become a part of the envelope.
      if (isAcceptedReply(context)) {
        this.#envelope.recipients.push(event.address)
      }

      return
    }

    if (command.startsWith('DATA')) {
      const context: SmtpDataContext = {
        ...this.#createCommandContext(),
        beginMessage: () => {
          this.#isReadingData = true
        },
      }
      const event = new SmtpDataEvent(context)
      await this.emitAsPromise(event)

      if (!context.isReplied) {
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
      }

      return
    }

    if (command.startsWith('QUIT')) {
      const context = this.#createCommandContext()
      const event = new SmtpQuitEvent(context)
      await this.emitAsPromise(event)

      if (!context.isReplied) {
        this.reply(221, '2.0.0 Bye')
      }

      this.#socket.end()
      return
    }

    if (command.startsWith('RSET')) {
      // Resetting aborts the ongoing transaction, if any.
      this.#resetEnvelope()
      this.reply(250, '2.0.0 Ok')
      return
    }

    if (command.startsWith('NOOP')) {
      this.reply(250, '2.0.0 Ok')
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
    await this.emitAsPromise(event)

    if (!context.isReplied) {
      event.reply(500, '5.5.2 Command not recognized')
    }
  }

  /**
   * Handle the "AUTH" command, starting the challenge/response
   * exchange of the chosen mechanism.
   * @see https://datatracker.ietf.org/doc/html/rfc4954
   */
  async #handleAuth(line: string): Promise<void> {
    // Split the raw line: the initial response is base64 (case-sensitive).
    const [, mechanism = '', initialResponse] = line.split(' ')
    const method = mechanism.toUpperCase()

    if (method === 'PLAIN') {
      // "AUTH PLAIN <base64>" carries the credentials inline.
      if (initialResponse) {
        await this.#emitAuth(parsePlainCredentials(initialResponse))
        return
      }

      // "AUTH PLAIN" alone awaits the credentials as the response
      // to an empty server challenge.
      this.#pendingAuth = { method: 'PLAIN' }
      this.reply(334, '')
      return
    }

    if (method === 'LOGIN') {
      // "AUTH LOGIN <base64>" carries the username inline,
      // proceed to the password challenge right away.
      if (initialResponse) {
        this.#pendingAuth = {
          method: 'LOGIN',
          username: decodeBase64(initialResponse),
        }
        this.reply(334, BASE64_PASSWORD_CHALLENGE)
        return
      }

      this.#pendingAuth = { method: 'LOGIN' }
      this.reply(334, BASE64_USERNAME_CHALLENGE)
      return
    }

    this.reply(504, '5.5.4 Unrecognized authentication type')
  }

  async #handleAuthResponse(line: string): Promise<void> {
    const pendingAuth = this.#pendingAuth!

    // The client may abort the exchange at any point by sending "*".
    if (line === '*') {
      this.#pendingAuth = undefined
      this.reply(501, '5.7.0 Authentication aborted')
      return
    }

    if (pendingAuth.method === 'PLAIN') {
      this.#pendingAuth = undefined
      await this.#emitAuth(parsePlainCredentials(line))
      return
    }

    if (pendingAuth.username == null) {
      pendingAuth.username = decodeBase64(line)
      this.reply(334, BASE64_PASSWORD_CHALLENGE)
      return
    }

    const credentials: SmtpAuthEventData = {
      method: 'LOGIN',
      username: pendingAuth.username,
      password: decodeBase64(line),
    }
    this.#pendingAuth = undefined
    await this.#emitAuth(credentials)
  }

  async #emitAuth(
    credentials: SmtpAuthEventData
  ): Promise<void> {
    const context = this.#createCommandContext()
    const event = new SmtpAuthEvent(credentials, context)
    await this.emitAsPromise(event)

    if (!context.isReplied) {
      event.accept()
    }
  }

  async #handleMessage(rawMessage: string): Promise<void> {
    const context = this.#createCommandContext()
    const event = new SmtpMessageEvent(
      {
        sender: this.#envelope.sender,
        recipients: this.#envelope.recipients,
        message: Buffer.from(undoDotStuffing(rawMessage)),
      },
      context
    )

    // A finished message transfer concludes the transaction.
    // The client may start another one on the same connection.
    this.#resetEnvelope()

    await this.emitAsPromise(event)

    if (!context.isReplied) {
      event.accept()
    }
  }
}

function isAcceptedReply(context: SmtpCommandContext): boolean {
  return context.repliedCode != null && context.repliedCode < 300
}

/**
 * Parse the argument of an SMTP address command
 * (e.g. `<user@example.com> SIZE=1024` for "MAIL FROM").
 */
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

/**
 * Undo the SMTP dot-stuffing: the client doubles every line-leading
 * dot in the message so it cannot be confused with the end-of-data
 * terminator.
 * @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.2
 */
function undoDotStuffing(message: string): string {
  return message
    .split('\r\n')
    .map((line) => {
      return line.startsWith('.') ? line.slice(1) : line
    })
    .join('\r\n')
}
