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
