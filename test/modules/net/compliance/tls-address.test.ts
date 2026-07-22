// @vitest-environment node
import net from 'node:net'
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

it('exposes address information after connecting', async () => {
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

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(server.port)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: socket.localPort,
  })

  socket.destroy()
})

it('exposes address information for a mocked connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = tls.connect(443, 'example.com')
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(443)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: socket.localPort,
  })

  socket.destroy()
})

it('exposes address information for a mocked IPv6 connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const connectionOptions: tls.ConnectionOptions & net.TcpNetConnectOpts = {
    port: 443,
    host: 'example.com',
    family: 6,
  }
  const socket = tls.connect(connectionOptions)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('::1')
  expect.soft(socket.remotePort).toBe(443)
  expect.soft(socket.remoteFamily).toBe('IPv6')
  expect.soft(socket.localAddress).toBe('::1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '::1',
    family: 'IPv6',
    port: socket.localPort,
  })

  socket.destroy()
})
