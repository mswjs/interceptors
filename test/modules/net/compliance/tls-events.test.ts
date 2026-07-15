// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer } from '#/test/helpers'
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

it('emits "secureConnect" exactly once', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalled()
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })

  expect(secureConnectListener).toHaveBeenCalledOnce()

  socket.destroy()
})

it('emits the "session" event', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const sessionListener = vi.fn()
  socket.on('session', sessionListener)

  await expect.poll(() => sessionListener).toHaveBeenCalled()
  expect(sessionListener).toHaveBeenCalledWith(expect.any(Buffer))

  socket.destroy()
})

it('emits the "keylog" event', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const keylogListener = vi.fn()
  socket.on('keylog', keylogListener)

  await expect.poll(() => keylogListener).toHaveBeenCalled()
  expect(keylogListener).toHaveBeenCalledWith(expect.any(Buffer))

  socket.destroy()
})

it('emits the "OCSPResponse" event', async () => {
  await using server = await createTestServer(() => {
    const tlsServer = new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
    tlsServer.on('OCSPRequest', (certificate, issuer, callback) => {
      callback(null, Buffer.from('mock-ocsp-response'))
    })
    return tlsServer
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
    requestOCSP: true,
  })
  const ocspResponseListener = vi.fn()
  socket.on('OCSPResponse', ocspResponseListener)

  await expect.poll(() => ocspResponseListener).toHaveBeenCalledOnce()
  expect(ocspResponseListener).toHaveBeenCalledWith(
    Buffer.from('mock-ocsp-response')
  )

  socket.destroy()
})
