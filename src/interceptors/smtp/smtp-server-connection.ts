import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import type {
  TcpSocketController,
  TlsSocketController,
} from '../net/socket-controller'
import { SmtpEventTarget } from './event-target'
import type { SmtpSession } from './smtp-session'

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
 * passthrough session. Prevent the default of the event to stop the
 * reply from reaching the client, then author what the client sees
 * through the controller (e.g. `controller.reply()`).
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

type SmtpPhase =
  | { phase: 'helo' }
  | { phase: 'auth' }
  | { phase: 'sender' }
  | { phase: 'recipient'; address: string }
  | { phase: 'data' }
  | { phase: 'message' }
  | { phase: 'quit' }
  | { phase: 'reply' }

interface SmtpServerConnectionOptions {
  session: SmtpSession
  realSocket: net.Socket | tls.TLSSocket
  socketController: TcpSocketController | TlsSocketController
  clientSocket: net.Socket | tls.TLSSocket
}

const CRLF = Buffer.from('\r\n')
const DATA_TERMINATOR = Buffer.from('\r\n.\r\n')

/**
 * The real SMTP server connection of a passthrough session, returned
 * by `controller.passthrough()`. It mediates the server's reply stream:
 * every reply is parsed, correlated to the client command it answers,
 * and emitted as a phase-named event before being forwarded to the
 * client. Prevent the default of any event to withhold that reply, then
 * author the client-facing reply through the controller.
 *
 * @note SMTP is lockstep (no pipelining), so each server reply maps to
 * the outstanding client command. Rewriting an intermediate reply
 * ("334"/"354") may desync this correlation, since it changes what the
 * client does next — observe and substitute final verdicts instead.
 */
export class SmtpServerConnection extends SmtpEventTarget<SmtpServerConnectionEventMap> {
  #session: SmtpSession
  #realSocket: net.Socket | tls.TLSSocket
  #forwardToClient: (chunk: Buffer) => void

  #serverBuffer = Buffer.alloc(0)
  #clientBuffer = Buffer.alloc(0)
  #phaseQueue: Array<SmtpPhase> = []
  #greetingSeen = false
  #expectContinuationLine = false
  #clientInData = false

  constructor(options: SmtpServerConnectionOptions) {
    super()

    this.#session = options.session
    this.#realSocket = options.realSocket
    this.#forwardToClient = (chunk) => {
      options.clientSocket.write(chunk)
    }

    // Take over the forwarding of the server's replies so a listener
    // can suppress or rewrite a single reply (via "preventDefault()").
    options.socketController.onPassthroughRead((chunk) => {
      this.#handleServerData(chunk)
    })

    // Observe the client's outgoing commands to know which command
    // each server reply answers ("this.#realSocket" carries the same
    // bytes but the client socket is where they originate).
    options.clientSocket.on('data', (chunk: Buffer) => {
      this.#handleClientData(chunk)
    })
  }

  /**
   * The underlying socket connected to the real SMTP server.
   */
  public get socket(): net.Socket | tls.TLSSocket {
    return this.#realSocket
  }

  /**
   * Gracefully close the connection to the real server (a TCP FIN).
   * The client observes the upstream ending the session, the same as
   * if the real server closed the transmission channel.
   *
   * @note This is a transport-level close, not an SMTP "QUIT". The
   * client is never sent a reply it did not ask for; to author a
   * client-facing reply, prevent the default of an event and use the
   * controller instead.
   */
  public close(): void {
    this.#realSocket.end()
  }

  /**
   * Abruptly terminate the connection to the real server, the way the
   * real server crashing or the network dropping would. The client
   * observes a connection error propagated from the upstream. This is
   * the real-server analog of "controller.error()".
   */
  public destroy(reason?: Error): void {
    const error =
      reason ??
      Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
        syscall: 'read',
      })

    this.#realSocket.destroy(error)
  }

  #handleServerData(chunk: Buffer): void {
    this.#serverBuffer = Buffer.concat([this.#serverBuffer, chunk])

    // Process synchronously so a forwarded reply is written to the
    // client before the real socket's "end" pushes the EOF. A listener
    // must call "preventDefault()" synchronously to withhold a reply.
    while (true) {
      const reply = this.#extractReply()

      if (reply == null) {
        return
      }

      this.#handleServerReply(reply)
    }
  }

  #extractReply(): { code: number; lines: Array<string>; raw: Buffer } | null {
    const lines: Array<string> = []
    let offset = 0

    while (true) {
      const lineEndIndex = this.#serverBuffer.indexOf(CRLF, offset)

      // The reply is incomplete: wait for the rest of it.
      if (lineEndIndex === -1) {
        return null
      }

      const line = this.#serverBuffer.subarray(offset, lineEndIndex).toString('utf8')
      const separator = line[3]
      lines.push(line.slice(4))
      offset = lineEndIndex + 2

      // A space after the code marks the final line of the reply;
      // a hyphen marks a continuation line of a multiline reply.
      if (separator !== '-') {
        const raw = this.#serverBuffer.subarray(0, offset)
        this.#serverBuffer = this.#serverBuffer.subarray(offset)

        return {
          code: Number.parseInt(line.slice(0, 3), 10),
          lines,
          raw,
        }
      }
    }
  }

  #handleServerReply(reply: {
    code: number
    lines: Array<string>
    raw: Buffer
  }): void {
    const event = this.#createReplyEvent(reply)

    this.emitter.emit(event)

    // An intermediate reply drives what the client sends next: "354"
    // begins the message transfer, "334" prompts a single continuation
    // line (e.g. the base64 credentials of an "AUTH" exchange).
    if (reply.code === 354) {
      this.#clientInData = true
    } else if (reply.code === 334) {
      this.#expectContinuationLine = true
    }

    // Forward the original reply to the client unless a listener
    // withheld it to author its own reply through the controller.
    if (!event.defaultPrevented) {
      this.#forwardToClient(reply.raw)
    }
  }

  #createReplyEvent(reply: {
    code: number
    lines: Array<string>
  }): SmtpServerConnectionEventMap[keyof SmtpServerConnectionEventMap] {
    const data: SmtpServerReplyData = { code: reply.code, lines: reply.lines }

    // The first reply is always the greeting: the server speaks first.
    if (!this.#greetingSeen) {
      this.#greetingSeen = true
      return new SmtpServerGreetingEvent(data)
    }

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

  #handleClientData(chunk: Buffer): void {
    this.#clientBuffer = Buffer.concat([this.#clientBuffer, chunk])

    while (true) {
      // Consume the message body without treating it as commands.
      if (this.#clientInData) {
        const terminatorIndex = this.#clientBuffer.indexOf(DATA_TERMINATOR)

        if (terminatorIndex === -1) {
          return
        }

        this.#clientBuffer = this.#clientBuffer.subarray(
          terminatorIndex + DATA_TERMINATOR.length
        )
        this.#clientInData = false
        continue
      }

      const lineEndIndex = this.#clientBuffer.indexOf(CRLF)

      if (lineEndIndex === -1) {
        return
      }

      const line = this.#clientBuffer.subarray(0, lineEndIndex).toString('utf8')
      this.#clientBuffer = this.#clientBuffer.subarray(lineEndIndex + 2)

      // A line sent in response to a "334" challenge is a continuation
      // (e.g. base64 credentials), not a command.
      if (this.#expectContinuationLine) {
        this.#expectContinuationLine = false
        continue
      }

      this.#trackCommand(line)
    }
  }

  #trackCommand(line: string): void {
    const command = line.toUpperCase()

    if (command.startsWith('EHLO') || command.startsWith('HELO')) {
      this.#session.heloHostname = line.slice('EHLO '.length).trim()
      this.#phaseQueue.push({ phase: 'helo' })
      return
    }

    if (command.startsWith('AUTH')) {
      this.#phaseQueue.push({ phase: 'auth' })
      return
    }

    if (command.startsWith('MAIL FROM:')) {
      this.#phaseQueue.push({ phase: 'sender' })
      return
    }

    if (command.startsWith('RCPT TO:')) {
      this.#phaseQueue.push({
        phase: 'recipient',
        address: parseAddress(line.slice('RCPT TO:'.length)),
      })
      return
    }

    if (command.startsWith('DATA')) {
      this.#phaseQueue.push({ phase: 'data' })
      return
    }

    if (command.startsWith('QUIT')) {
      this.#phaseQueue.push({ phase: 'quit' })
      return
    }

    // Any other command (e.g. "RSET", "NOOP") gets a generic reply.
    this.#phaseQueue.push({ phase: 'reply' })
  }
}

function parseAddress(input: string): string {
  return input.match(/<([^>]*)>/)?.[1] ?? ''
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
