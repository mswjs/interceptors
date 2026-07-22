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

it('aborts the SMTP session at any point via "client.abort()"', async () => {
  interceptor.on('session', ({ client }) => {
    // Abort the session per the SMTP protocol: the server replies
    // "421" and closes the transmission channel.
    client.on('sender', () => {
      client.abort('4.3.2 System shutting down')
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

it('errors the SMTP connection abruptly via "client.error()"', async () => {
  interceptor.on('session', ({ client }) => {
    // Error the connection without any SMTP reply,
    // like a server crash or a broken network would.
    client.on('recipient', () => {
      client.error()
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
