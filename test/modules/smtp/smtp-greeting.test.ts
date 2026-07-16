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

it('rejects the connection at the greeting', async () => {
  interceptor.on('session', ({ controller }) => {
    // A server may greet the connection with "554", refusing
    // to serve it before the client sends anything.
    controller.claim({ code: 554, message: 'No SMTP service here' })
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
    controller.claim(null)
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
