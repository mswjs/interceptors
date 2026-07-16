import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { Interceptor } from '#/src/interceptor'
import { SocketInterceptor } from '../net'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'
import { SmtpController } from './smtp-controller'

export * from './smtp-controller'

type SmtpEventMap = {
  session: SmtpSessionEvent
}

interface SmtpSessionEventData {
  url: URL
  socket: net.Socket | tls.TLSSocket
  connectionOptions: NetworkConnectionOptions
  controller: SmtpController
}

export class SmtpSessionEvent<
  DataType extends SmtpSessionEventData = SmtpSessionEventData,
> extends TypedEvent<DataType, void, 'session'> {
  /**
   * The session target ("smtp://localhost:587"). Use this to decide
   * which sessions to mock. The protocol is "smtps:" for sessions
   * established over implicit TLS.
   */
  public url: URL
  public socket: net.Socket | tls.TLSSocket
  public connectionOptions: NetworkConnectionOptions
  public controller: SmtpController

  constructor(data: DataType) {
    super(...(['session', {}] as any))

    this.url = data.url
    this.socket = data.socket
    this.connectionOptions = data.connectionOptions
    this.controller = data.controller
  }
}

/**
 * Coerce the connection options into the session URL.
 *
 * @note The WHATWG URL treats "smtp:" as a non-special scheme and
 * skips the hostname case normalization, so lowercase it here
 * (hostnames are case-insensitive).
 */
function getSessionUrl(
  connectionOptions: NetworkConnectionOptions,
  socket: net.Socket | tls.TLSSocket
): URL {
  const protocol = socket instanceof tls.TLSSocket ? 'smtps:' : 'smtp:'
  const rawHostname = (connectionOptions.host ?? 'localhost').toLowerCase()
  const hostname = net.isIPv6(rawHostname) ? `[${rawHostname}]` : rawHostname
  const port = Number(connectionOptions.port)

  return new URL(`${protocol}//${hostname}:${port}`)
}

/**
 * Interceptor for SMTP connections in Node.js.
 *
 * @note SMTP is a server-greets-first protocol: the client sends
 * nothing until it receives the server's "220" greeting. The "session"
 * listener must decide between "controller.claim()" (mocking) and
 * "controller.passthrough()" based on the session URL alone
 * (e.g. the SMTP port), never on the incoming data. Once claimed,
 * the mock server speaks first by writing the greeting.
 */
export class SmtpInterceptor extends Interceptor<SmtpEventMap> {
  static symbol = Symbol.for('smtp-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    const socketInterceptor = Interceptor.singleton(SocketInterceptor)

    socketInterceptor.apply(this)
    this.subscriptions.push(() => {
      socketInterceptor.dispose(this)
    })

    const controller = new AbortController()
    this.subscriptions.push(() => controller.abort())

    socketInterceptor.on(
      'connection',
      ({ socket, connectionOptions, controller: socketController }) => {
        /**
         * @note IPC (path-based) connections have no network authority
         * and cannot be SMTP sessions. Let them pass through.
         */
        if (connectionOptions.port == null) {
          socketController.passthrough()
          return
        }

        const smtpController = new SmtpController({
          socket,
          socketController,
        })

        if (
          !this.emitter.emit(
            new SmtpSessionEvent({
              url: getSessionUrl(connectionOptions, socket),
              socket,
              connectionOptions,
              controller: smtpController,
            })
          )
        ) {
          /**
           * @note Subscribing to the socket interceptor suppresses its
           * own passthrough-by-default behavior for unhandled connections.
           * Restore it here for connections no "session" listener handles.
           */
          socketController.passthrough()
        }
      },
      {
        signal: controller.signal,
      }
    )
  }
}
