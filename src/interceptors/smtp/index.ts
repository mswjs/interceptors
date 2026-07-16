import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import { Interceptor } from '#/src/interceptor'
import { SocketInterceptor } from '../net'
import type {
  TcpSocketController,
  TlsSocketController,
} from '../net/socket-controller'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'

type SmtpEventMap = {
  email: SmtpEmailEvent
}

interface SmtpEmailEventData {
  socket: net.Socket | tls.TLSSocket
  connectionOptions: NetworkConnectionOptions
  controller: TcpSocketController | TlsSocketController
}

export class SmtpEmailEvent<
  DataType extends SmtpEmailEventData = SmtpEmailEventData,
> extends TypedEvent<DataType, void, 'email'> {
  public socket: net.Socket | tls.TLSSocket
  public connectionOptions: NetworkConnectionOptions
  public controller: TcpSocketController | TlsSocketController

  constructor(data: DataType) {
    super(...(['email', {}] as any))

    this.socket = data.socket
    this.connectionOptions = data.connectionOptions
    this.controller = data.controller
  }
}

/**
 * Interceptor for SMTP connections in Node.js.
 *
 * @note SMTP is a server-greets-first protocol: the client sends
 * nothing until it receives the server's "220" greeting. The "email"
 * listener must decide between "controller.claim()" (mocking) and
 * "controller.passthrough()" based on the connection options alone
 * (e.g. the SMTP port), never on the incoming data. Once claimed,
 * the mock server must speak first by writing the greeting.
 *
 * @todo Implement the SMTP session state machine (greeting, EHLO,
 * MAIL/RCPT/DATA, dot-unstuffing) and expose the parsed email
 * (envelope, message) on the event, with "accept()"/"reject()"
 * response controls, instead of the raw socket.
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
        const isHandled = this.emitter.emit(
          new SmtpEmailEvent({
            socket,
            connectionOptions,
            controller: socketController,
          })
        )

        /**
         * @note Subscribing to the socket interceptor suppresses its
         * own passthrough-by-default behavior for unhandled connections.
         * Restore it here for connections no "email" listener handles.
         */
        if (!isHandled) {
          socketController.passthrough()
        }
      },
      {
        signal: controller.signal,
      }
    )
  }
}
