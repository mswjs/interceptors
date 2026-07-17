// @vitest-environment node
import net from 'node:net'
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

  interceptor.on('session', ({ client }) => {
    // A handled session is mocked by default: the "220" greeting is
    // sent once the listener settles, and commands without listeners
    // are accepted with sensible defaults.

    // The "message" event describes the complete email transaction:
    // the sender, the accepted recipients, and the message itself.
    client.on('message', (event) => {
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

it('defers the message so the client can retry it', async () => {
  interceptor.on('session', ({ client }) => {
    // A transient rejection tells the client the message may be
    // retried later (e.g. greylisting, a busy server).
    client.on('message', (event) => {
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

it('preserves multibyte message content split across packets', async () => {
  const messages: Array<Buffer> = []

  interceptor.on('session', ({ client }) => {
    client.on('message', (event) => {
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
