import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { Interceptor } from '#/src/interceptor'
import { SocketInterceptor } from '../net'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'
import {
  kActivate,
  kDetach,
  kGreeted,
  SmtpClientConnection,
} from './smtp-client-connection'
import { SmtpServerConnection } from './smtp-server-connection'
import { SmtpSession } from './smtp-session'

export * from './smtp-client-connection'
export * from './smtp-server-connection'
export * from './smtp-session'

type SmtpEventMap = {
  session: SmtpSessionEvent
}

interface SmtpSessionEventData {
  session: SmtpSession
  client: SmtpClientConnection
  server: SmtpServerConnection
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
   * The intercepted side of the session: the client commands and the
   * replies it observes ("greet()"/"reply()"/"abort()"/"error()").
   */
  public client: SmtpClientConnection
  /**
   * The real server of the session: inert until "connect()".
   * Connecting before the greeting bypasses the session to the real
   * server; connecting later opens a subordinate connection for
   * "send()" (a real delivery the handler controls).
   */
  public server: SmtpServerConnection
  /**
   * Establish this connection as-is, without any SMTP handling.
   * This is the escape hatch for connections that are not SMTP
   * sessions to handle (e.g. the same process talking to a REST API):
   * no events fire and no bytes are touched.
   */
  public passthrough: () => void

  constructor(data: DataType, init: { passthrough: () => void }) {
    super(...(['session', {}] as any))

    this.session = data.session
    this.client = data.client
    this.server = data.server
    this.passthrough = init.passthrough
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
 * Every handled connection is claimed: the "session" listener receives
 * the client and server connections and decides the session's fate by
 * how it uses them. Doing nothing mocks the session (the mock greets
 * "220" once the listener settles); "server.connect()" before the
 * greeting bypasses the session to the real server.
 *
 * @note SMTP is a server-greets-first protocol: the client sends
 * nothing until it receives the server's greeting, so the fate of a
 * session must be decided before the greeting is authored — based on
 * the session description alone, never on the incoming data.
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

        /**
         * @note Subscribing to the socket interceptor suppresses its
         * own passthrough-by-default behavior for unhandled connections.
         * Restore it here for connections no "session" listener handles.
         */
        if (this.emitter.listenerCount('session') === 0) {
          socketController.passthrough()
          return
        }

        const secure = socket instanceof tls.TLSSocket
        const session = new SmtpSession({
          url: getSessionUrl(connectionOptions, secure),
          secure,
          connectionOptions,
        })

        const client = new SmtpClientConnection({ session, socket })
        const server = new SmtpServerConnection({
          session,
          client,
          clientSocket: socket,
          createConnection: () => {
            return socketController.createRealConnection()
          },
        })
        let isPassthrough = false

        this.emitter
          .emitAsPromise(
            new SmtpSessionEvent(
              { session, client, server },
              {
                passthrough: () => {
                  isPassthrough = true
                  client[kDetach]()
                  socketController.passthrough()
                },
              }
            )
          )
          .then(() => {
            // The listener passed the connection through raw:
            // none of its bytes are SMTP.
            if (isPassthrough) {
              return
            }

            /**
             * @note The session's fate settles once the listeners do:
             * claim the socket, start parsing the client commands, and
             * author the greeting — a bypassed session has already
             * relayed the real greeting, anything else is a mocked
             * session the mock greets.
             */
            socketController.claim()
            client[kActivate]()

            if (!client[kGreeted]) {
              client.greet()
            }
          })
          .catch(() => {
            /**
             * @note An exception in a "session" listener is translated
             * onto the connection the same way a server crashing while
             * accepting it would manifest: the client observes an abrupt
             * connection error.
             */
            if (!isPassthrough) {
              client.error()
            }
          })
      },
      {
        signal: controller.signal,
      }
    )
  }
}
