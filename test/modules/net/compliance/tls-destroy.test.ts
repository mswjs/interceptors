// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'

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

it('emits no connection events for a socket destroyed before the connection resolves', async () => {
  // Keep the connection pending (no verdict) so the client awaits
  // the connection notification when the socket gets destroyed.
  interceptor.on('connection', () => {})

  const socket = tls.connect(443, 'non-existing.example')
  const connectListener = vi.fn()
  socket.on('connect', connectListener)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const closeListener = vi.fn()
  socket.on('close', closeListener)

  process.nextTick(() => {
    socket.destroy()
  })

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect.soft(connectListener).not.toHaveBeenCalled()
  expect.soft(secureConnectListener).not.toHaveBeenCalled()
  expect(errorListener).not.toHaveBeenCalled()
})

it('emits no "secureConnect" for a socket destroyed by its "connect" listener', async () => {
  interceptor.on('connection', () => {})

  const socket = tls.connect(443, 'non-existing.example')
  const connectListener = vi.fn(() => {
    socket.destroy()
  })
  socket.on('connect', connectListener)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const closeListener = vi.fn()
  socket.on('close', closeListener)

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect.soft(connectListener).toHaveBeenCalledOnce()
  expect.soft(secureConnectListener).not.toHaveBeenCalled()
  expect(errorListener).not.toHaveBeenCalled()
})
