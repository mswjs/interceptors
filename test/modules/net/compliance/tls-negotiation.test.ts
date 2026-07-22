// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer } from '#/test/helpers'
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

it('negotiates the TLS protocol and cipher', async () => {
  await using server = await createRawTestServer(() => {
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

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.getProtocol()).toBe('TLSv1.3')
  expect(socket.getCipher()).toEqual({
    name: 'TLS_AES_256_GCM_SHA384',
    standardName: 'TLS_AES_256_GCM_SHA384',
    version: 'TLSv1.3',
  })

  socket.destroy()
})

it('negotiates the ALPN protocol', async () => {
  await using server = await createRawTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
      ALPNProtocols: ['h2', 'http/1.1'],
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
    ALPNProtocols: ['http/1.1'],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect(socket.alpnProtocol).toBe('http/1.1')

  socket.destroy()
})

it('reports no ALPN protocol if none was requested', async () => {
  await using server = await createRawTestServer(() => {
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

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect(socket.alpnProtocol).toBe(false)

  socket.destroy()
})

it('sends the SNI servername to the server', async () => {
  const serverSecureConnectionListener = vi.fn()

  await using server = await createRawTestServer(() => {
    const tlsServer = new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
    tlsServer.on('secureConnection', (serverSocket) => {
      serverSecureConnectionListener(serverSocket.servername)
    })
    return tlsServer
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  await expect.poll(() => serverSecureConnectionListener).toHaveBeenCalled()

  // The server must observe exactly one connection with the
  // servername requested by the client.
  expect.soft(serverSecureConnectionListener).toHaveBeenCalledOnce()
  expect(serverSecureConnectionListener).toHaveBeenCalledWith('localhost')

  socket.destroy()
})
