import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'

export interface SmtpAuthCredentials {
  method: 'PLAIN' | 'LOGIN'
  username: string
  password: string
}

/**
 * A description of a single SMTP session. It is a plain record with no
 * methods: use the controller to affect the connection. Some properties
 * are known the moment the session begins ("url", "secure"), while
 * others are populated as the client reaches the corresponding phase
 * ("heloHostname" after "EHLO", "user"/"auth" after "AUTH"). The same
 * session object stays live for the duration of the connection.
 */
export class SmtpSession {
  /**
   * The session target ("smtp://localhost:587"). Use this to decide
   * which sessions to handle. The protocol is "smtps:" for sessions
   * established over implicit TLS.
   */
  public readonly url: URL

  /**
   * Whether the session is established over TLS.
   */
  public readonly secure: boolean

  /**
   * The normalized options the connection was created with.
   */
  public readonly connectionOptions: NetworkConnectionOptions

  /**
   * The hostname the client identified itself with ("EHLO"/"HELO").
   * Undefined until the client sends it.
   */
  public heloHostname?: string

  /**
   * The authenticated identity ("AUTH"). Undefined until the client
   * authenticates successfully.
   */
  public user?: string

  /**
   * The credentials the client authenticated with ("AUTH"). Undefined
   * until the client sends them.
   */
  public auth?: SmtpAuthCredentials

  constructor(init: {
    url: URL
    secure: boolean
    connectionOptions: NetworkConnectionOptions
  }) {
    this.url = init.url
    this.secure = init.secure
    this.connectionOptions = init.connectionOptions
  }
}
