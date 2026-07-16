// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
import nodemailer from 'nodemailer'
import { SmtpInterceptor } from '#/src/interceptors/smtp'

const interceptor = new SmtpInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

const SMTP_PORT = 587

it('mocks sending an email via nodemailer', async () => {
  let sender = ''
  let recipients: Array<string> = []
  let sentMessage = ''

  interceptor.on('session', ({ connectionOptions, controller }) => {
    if (connectionOptions.port !== SMTP_PORT) {
      return controller.passthrough()
    }

    // Claiming sends the "220" greeting and runs the mock SMTP session.
    // Commands without listeners are accepted with sensible defaults.
    controller.claim()

    // The "message" event describes the complete email transaction:
    // the sender, the accepted recipients, and the message itself.
    controller.on('message', (event) => {
      sender = event.sender
      recipients = event.recipients
      sentMessage = event.message.toString()
      event.accept({ queueId: 'MOCKED' })
    })
  })

  /**
   * @note Nodemailer resolves the hostname itself (via "dns.lookup")
   * before creating the socket, so the host must be resolvable.
   * No connection is made to it: the socket is claimed by the mock.
   */
  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello from the mocked SMTP server!',
  })

  // The client observes a successful email delivery.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual([])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as MOCKED')

  // The mock server observes the correct envelope and message.
  expect.soft(sender).toBe('app@example.com')
  expect.soft(recipients).toEqual(['user@example.com'])
  expect.soft(sentMessage).toContain('From: app@example.com')
  expect.soft(sentMessage).toContain('To: user@example.com')
  expect.soft(sentMessage).toContain('Subject: Hello')
  expect(sentMessage).toContain('Hello from the mocked SMTP server!')
})

it('exposes the session URL for filtering', async () => {
  const sessionUrls: Array<URL> = []

  interceptor.on('session', ({ url, controller }) => {
    sessionUrls.push(url)
    controller.claim()
  })

  /**
   * @note Use a raw socket to pin the URL coercion: clients like
   * Nodemailer resolve hostnames themselves and connect to the
   * resolved address, so the URL then reflects the IP instead.
   */
  const socket = net.connect(SMTP_PORT, 'LOCALHOST')

  await expect.poll(() => sessionUrls.length).toBe(1)

  // The hostname is lowercased (hostnames are case-insensitive).
  expect.soft(sessionUrls[0]).toBeInstanceOf(URL)
  expect.soft(sessionUrls[0].protocol).toBe('smtp:')
  expect.soft(sessionUrls[0].hostname).toBe('localhost')
  expect.soft(sessionUrls[0].port).toBe('587')
  expect(sessionUrls[0].host).toBe('localhost:587')

  socket.destroy()
})

it('exposes the "smtps:" session URL for implicit TLS connections', async () => {
  const sessionUrls: Array<URL> = []

  interceptor.on('session', ({ url, controller }) => {
    sessionUrls.push(url)
    controller.claim()
  })

  const socket = tls.connect(465, 'smtp.example.com')

  await expect.poll(() => sessionUrls.length).toBe(1)

  expect.soft(sessionUrls[0].protocol).toBe('smtps:')
  expect(sessionUrls[0].host).toBe('smtp.example.com:465')

  socket.destroy()
})

it('rejects individual recipients', async () => {
  const messageListener = vi.fn<(recipients: Array<string>) => void>()

  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // Each recipient receives its own verdict: this is how partial
    // delivery works (some recipients accepted, others rejected).
    controller.on('recipient', (event) => {
      if (event.address === 'gone@example.com') {
        event.reject({ reason: 'No such user' })
      } else {
        event.accept()
      }
    })

    controller.on('message', (event) => {
      messageListener(event.recipients)
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: ['user@example.com', 'gone@example.com'],
    text: 'Hello',
  })

  // The client observes the partial delivery.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual(['gone@example.com'])

  // The completed transaction only includes the accepted recipients.
  expect(messageListener).toHaveBeenCalledExactlyOnceWith(['user@example.com'])
})

it('authenticates the client', async () => {
  const authenticationListener = vi.fn()

  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // The "auth" event fires once the challenge/response
    // exchange of the chosen mechanism collects the credentials.
    controller.on('auth', (event) => {
      authenticationListener({
        method: event.method,
        username: event.username,
        password: event.password,
      })
      event.accept()
    })

    controller.on('message', (event) => {
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: 'app@example.com',
      pass: 'supersecret',
    },
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect(authenticationListener).toHaveBeenCalledExactlyOnceWith({
    method: 'PLAIN',
    username: 'app@example.com',
    password: 'supersecret',
  })
})

it('authenticates the client with the multi-step "LOGIN" mechanism', async () => {
  const authenticationListener = vi.fn()

  interceptor.on('session', ({ controller }) => {
    controller.claim()

    controller.on('auth', (event) => {
      authenticationListener({
        method: event.method,
        username: event.username,
        password: event.password,
      })
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    authMethod: 'LOGIN',
    auth: {
      user: 'app@example.com',
      pass: 'supersecret',
    },
  })

  await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect(authenticationListener).toHaveBeenCalledExactlyOnceWith({
    method: 'LOGIN',
    username: 'app@example.com',
    password: 'supersecret',
  })
})

it('rejects invalid credentials', async () => {
  interceptor.on('session', ({ controller }) => {
    controller.claim()

    controller.on('auth', (event) => {
      if (event.password === 'valid') {
        event.accept()
      } else {
        event.reject({ reason: 'Invalid username or password' })
      }
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: 'app@example.com',
      pass: 'wrong',
    },
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EAUTH',
    responseCode: 535,
    response: '535 5.7.8 Invalid username or password',
  })
})

it('defers the message so the client can retry it', async () => {
  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // A transient rejection tells the client the message may be
    // retried later (e.g. greylisting, a busy server).
    controller.on('message', (event) => {
      event.defer({ reason: 'Server busy, try again later' })
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EMESSAGE',
    responseCode: 451,
    response: '451 4.3.0 Server busy, try again later',
  })
})

it('rejects the connection at the greeting', async () => {
  interceptor.on('session', ({ controller }) => {
    // A server may greet the connection with "554", refusing
    // to serve it before the client sends anything.
    controller.claim({
      greeting: { code: 554, message: 'No SMTP service here' },
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EPROTOCOL',
    responseCode: 554,
    response: '554 No SMTP service here',
  })
})

it('never greets the connection so the client times out', async () => {
  interceptor.on('session', ({ controller }) => {
    // A silent mock server exercises the client's greeting timeout.
    controller.claim({ greeting: false })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    greetingTimeout: 300,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'ETIMEDOUT',
    message: 'Greeting never received',
  })
})

it('preserves multibyte message content split across packets', async () => {
  const messages: Array<Buffer> = []

  interceptor.on('session', ({ controller }) => {
    controller.claim()

    controller.on('message', (event) => {
      messages.push(event.message)
      event.accept()
    })
  })

  const socket = net.connect(SMTP_PORT, 'localhost')
  socket.write(
    'EHLO test\r\nMAIL FROM:<app@example.com>\r\nRCPT TO:<user@example.com>\r\nDATA\r\n'
  )

  // Split the message content mid-character: the two bytes of "é"
  // (0xC3 0xA9) arrive in separate packets.
  const messageContent = Buffer.from('Subject: Test\r\n\r\nhéllo wörld\r\n.\r\n')
  const splitIndex = messageContent.indexOf(0xc3) + 1
  socket.write(messageContent.subarray(0, splitIndex))

  await new Promise((resolve) => {
    setTimeout(resolve, 50)
  })
  socket.write(messageContent.subarray(splitIndex))
  socket.write('QUIT\r\n')

  await expect.poll(() => messages.length).toBe(1)

  const receivedMessage = messages[0].toString()
  expect.soft(receivedMessage).not.toContain('�')
  expect(receivedMessage).toContain('héllo wörld')

  socket.destroy()
})

it('translates a command listener exception into a "451" reply', async () => {
  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // An exception in a command listener surfaces the same way
    // an internal error of a real server would: the in-flight
    // command receives a "451" ("local error in processing").
    controller.on('message', () => {
      throw new Error('Unexpected listener error')
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EMESSAGE',
    responseCode: 451,
    response: '451 4.3.0 Local error in processing',
  })
})

it('translates a "session" listener exception into a connection error', async () => {
  interceptor.on('session', () => {
    throw new Error('Unexpected listener error')
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  // The client observes the connection erroring abruptly,
  // like a server crashing while accepting it.
  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'ESOCKET',
    message: 'read ECONNRESET',
  })
})

it('aborts the SMTP session at any point via "controller.abort()"', async () => {
  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // Abort the session per the SMTP protocol: the server replies
    // "421" and closes the transmission channel.
    controller.on('sender', () => {
      controller.abort('4.3.2 System shutting down')
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EENVELOPE',
    responseCode: 421,
    response: '421 4.3.2 System shutting down',
  })
})

it('errors the SMTP connection abruptly via "controller.error()"', async () => {
  interceptor.on('session', ({ controller }) => {
    controller.claim()

    // Error the connection without any SMTP reply,
    // like a server crash or a broken network would.
    controller.on('recipient', () => {
      controller.error()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'ESOCKET',
    message: 'read ECONNRESET',
  })
})
