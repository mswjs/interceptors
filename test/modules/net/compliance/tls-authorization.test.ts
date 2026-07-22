// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer, spyOnSocket } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from './fixtures/tls'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

function createTlsServer(): tls.Server {
  return new tls.Server({
    cert: TLS_CERTIFICATE,
    key: TLS_PRIVATE_KEY,
  })
}

it('rejects a self-signed server by default', async () => {
  await using server = await createRawTestServer(createTlsServer)

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
  })
  const { listeners } = spyOnSocket(socket)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()

  const [connectionError] = listeners.error.mock.calls[0]
  expect.soft(connectionError).toBeInstanceOf(Error)
  expect.soft(connectionError.code).toBe('DEPTH_ZERO_SELF_SIGNED_CERT')
  /**
   * @note Node.js 24+ appends a "--use-system-ca" hint to the message.
   */
  expect.soft(connectionError.message).toMatch(/^self-signed certificate/)

  expect(secureConnectListener).not.toHaveBeenCalled()
})

it('exposes the authorization state for an untrusted server', async () => {
  await using server = await createRawTestServer(createTlsServer)

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    rejectUnauthorized: false,
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.authorized).toBe(false)
  expect(String(socket.authorizationError)).toBe(
    'DEPTH_ZERO_SELF_SIGNED_CERT'
  )

  socket.destroy()
})

it('exposes the authorization state for a trusted server', async () => {
  await using server = await createRawTestServer(createTlsServer)

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.authorized).toBe(true)
  expect(socket.authorizationError).toBeNull()

  socket.destroy()
})

it('returns the real server certificate from "getPeerCertificate()"', async () => {
  await using server = await createRawTestServer(createTlsServer)

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  const peerCertificate = socket.getPeerCertificate()
  expect.soft(peerCertificate.subject.CN).toBe('localhost')
  expect(peerCertificate.subject.O).toBe('interceptors-test')

  socket.destroy()
})
