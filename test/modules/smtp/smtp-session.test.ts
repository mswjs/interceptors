// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
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
