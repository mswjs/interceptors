import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { Interceptor } from '#/src/interceptor'
import { SocketInterceptor } from '../net'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'
import { SmtpController } from './smtp-controller'
import { SmtpSession } from './smtp-session'

export * from './smtp-controller'
export * from './smtp-server-connection'
export * from './smtp-session'

type SmtpEventMap = {
  session: SmtpSessionEvent
}

interface SmtpSessionEventData {
  session: SmtpSession
  controller: SmtpController
}

export class SmtpSessionEvent<
  DataType extends SmtpSessionEventData = SmtpSessionEventData,
> extends TypedEvent<DataType, void, 'session'> {
  /**
   * The description of this SMTP session (target URL, TLS, and the
   * metadata that accumulates as the client advances). Use it to decide
   * which sessions to handle.
   */
  public session: SmtpSession
  /**
   * The only way to affect this connection: greet (and mock) it, pass
   * it through to the real server, reply, or terminate it.
   */
  public controller: SmtpController

  constructor(data: DataType) {
    super(...(['session', {}] as any))

    this.session = data.session
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
  secure: boolean
): URL {
  const protocol = secure ? 'smtps:' : 'smtp:'
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
 * "controller.passthrough()" based on the session description alone
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

        const secure = socket instanceof tls.TLSSocket
        const session = new SmtpSession({
          url: getSessionUrl(connectionOptions, secure),
          secure,
          connectionOptions,
        })

        const smtpController = new SmtpController({
          session,
          socket,
          socketController,
        })

        try {
          if (
            !this.emitter.emit(
              new SmtpSessionEvent({ session, controller: smtpController })
            )
          ) {
            /**
             * @note Subscribing to the socket interceptor suppresses its
             * own passthrough-by-default behavior for unhandled connections.
             * Restore it here for connections no "session" listener handles.
             */
            socketController.passthrough()
          }
        } catch (error) {
          /**
           * @note An exception in a "session" listener is translated
           * onto the connection the same way a server crashing while
           * accepting it would manifest: the client observes an abrupt
           * connection error.
           */
          smtpController.error()
        }
      },
      {
        signal: controller.signal,
      }
    )
  }
}
