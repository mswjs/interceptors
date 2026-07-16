// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
import nodemailer from 'nodemailer'
import { SmtpInterceptor, type SmtpSession } from '#/src/interceptors/smtp'

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

it('exposes the session URL for filtering', async () => {
  const sessionUrls: Array<URL> = []

  interceptor.on('session', ({ session, controller }) => {
    sessionUrls.push(session.url)
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

  interceptor.on('session', ({ session, controller }) => {
    sessionUrls.push(session.url)
    controller.claim()
  })

  const socket = tls.connect(465, 'smtp.example.com')

  await expect.poll(() => sessionUrls.length).toBe(1)

  expect.soft(sessionUrls[0].protocol).toBe('smtps:')
  expect(sessionUrls[0].host).toBe('smtp.example.com:465')

  socket.destroy()
})

it('populates session metadata as the client advances', async () => {
  let capturedSession: SmtpSession | undefined
  let secureAtStart: boolean | undefined
  let heloAtStart: string | undefined
  let heloAtMessage: string | undefined
  let userAtMessage: string | undefined

  interceptor.on('session', ({ session, controller }) => {
    // The same live session object is read at different times.
    capturedSession = session

    // Static metadata is known the moment the session begins.
    secureAtStart = session.secure
    // Dynamic metadata has not arrived yet.
    heloAtStart = session.heloHostname

    controller.claim()
    controller.on('auth', (event) => event.accept())
    controller.on('message', (event) => {
      // By message time the live session has accumulated the metadata.
      heloAtMessage = session.heloHostname
      userAtMessage = session.user
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: 587,
    secure: false,
    name: 'client.example.com',
    auth: { user: 'app@example.com', pass: 'secret' },
  })

  await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect.soft(secureAtStart).toBe(false)
  expect.soft(heloAtStart).toBeUndefined()
  expect.soft(heloAtMessage).toBe('client.example.com')
  expect.soft(userAtMessage).toBe('app@example.com')
  expect.soft(capturedSession?.user).toBe('app@example.com')
  expect(capturedSession?.auth).toEqual({
    method: 'PLAIN',
    username: 'app@example.com',
    password: 'secret',
  })

  transport.close()
})
