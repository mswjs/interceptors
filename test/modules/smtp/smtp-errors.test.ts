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

it('translates a command listener exception into a "451" reply', async () => {
  interceptor.on('session', ({ client }) => {
    // An exception in a command listener surfaces the same way
    // an internal error of a real server would: the in-flight
    // command receives a "451" ("local error in processing").
    client.on('message', () => {
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
