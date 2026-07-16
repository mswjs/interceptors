// @vitest-environment node
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
  let messageData = ''

  interceptor.on('email', ({ connectionOptions, controller }) => {
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
      messageData = event.message.toString()
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
  expect.soft(messageData).toContain('From: app@example.com')
  expect.soft(messageData).toContain('To: user@example.com')
  expect.soft(messageData).toContain('Subject: Hello')
  expect(messageData).toContain('Hello from the mocked SMTP server!')
})

it('rejects individual recipients', async () => {
  const messageListener = vi.fn<(recipients: Array<string>) => void>()

  interceptor.on('email', ({ controller }) => {
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

it('defers the message so the client can retry it', async () => {
  interceptor.on('email', ({ controller }) => {
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

it('aborts the SMTP session at any point via "controller.abort()"', async () => {
  interceptor.on('email', ({ controller }) => {
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
  interceptor.on('email', ({ controller }) => {
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
