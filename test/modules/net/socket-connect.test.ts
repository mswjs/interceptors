// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '../../../src/interceptors/net'
import { createTestServer } from '../../helpers'

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

it('emits the "connect" event for a mocked socket', async () => {
  const interceptorConnectionListener = vi.fn()
  interceptor.on('connection', ({ socket, controller }) => {
    interceptorConnectionListener(socket)
    controller.claim()
    socket.end()
  })

  const socket = net.connect(80, '127.0.0.1')

  const connectListener = vi.fn()
  const errorListener = vi.fn()
  const endListener = vi.fn()
  const closeListener = vi.fn()
  socket
    .on('connect', connectListener)
    .on('error', errorListener)
    .on('end', endListener)
    .on('close', closeListener)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect.soft(socket.connecting).toBe(false)
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect
    .soft(interceptorConnectionListener)
    .toHaveBeenCalledExactlyOnceWith(expect.any(net.Socket))

  await expect.poll(() => endListener).toHaveBeenCalledOnce()
  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
})

it('emits the "connect" event for a passthrough socket', async () => {
  const serverConnectionListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      serverConnectionListener(socket)
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)

  const connectListener = vi.fn()
  const errorListener = vi.fn()
  const endListener = vi.fn()
  const closeListener = vi.fn()
  socket
    .on('connect', connectListener)
    .on('error', errorListener)
    .on('end', endListener)
    .on('close', closeListener)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect.soft(socket.connecting).toBe(false)
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect
    .soft(serverConnectionListener)
    .toHaveBeenCalledExactlyOnceWith(expect.any(net.Socket))

  await expect.poll(() => endListener).toHaveBeenCalledOnce()
  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
})

it('does not emit the "connect" event for a mocked socket if controller errors the connection', async () => {
  const interceptorConnectionListener = vi.fn()
  interceptor.on('connection', ({ socket, controller }) => {
    interceptorConnectionListener(socket)
    controller.errorWith(new Error('Custom reason'))
  })

  const socket = net.connect(80, '127.0.0.1')

  const connectListener = vi.fn()
  const errorListener = vi.fn()
  const endListener = vi.fn()
  const closeListener = vi.fn()
  socket
    .on('connect', connectListener)
    .on('error', errorListener)
    .on('end', endListener)
    .on('close', closeListener)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect
    .poll(() => errorListener)
    .toHaveBeenCalledExactlyOnceWith(new Error('Custom reason'))
  expect.soft(socket.connecting).toBe(false)
  expect.soft(connectListener).not.toHaveBeenCalled()
  expect.soft(endListener).not.toHaveBeenCalled()
  expect
    .soft(interceptorConnectionListener)
    .toHaveBeenCalledExactlyOnceWith(expect.any(net.Socket))

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
})

it('does not emit the "connect" event for a passthrough socket if controller errors the connection', async () => {
  const interceptorConnectionListener = vi.fn()
  interceptor.on('connection', ({ socket, controller }) => {
    interceptorConnectionListener(socket)
    controller.errorWith(new Error('Custom reason'))
  })

  const serverConnectionListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      serverConnectionListener(socket)
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)

  const connectListener = vi.fn()
  const errorListener = vi.fn()
  const endListener = vi.fn()
  const closeListener = vi.fn()
  socket
    .on('connect', connectListener)
    .on('error', errorListener)
    .on('end', endListener)
    .on('close', closeListener)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect
    .poll(() => errorListener)
    .toHaveBeenCalledExactlyOnceWith(new Error('Custom reason'))

  expect.soft(socket.connecting).toBe(false)
  expect.soft(connectListener).not.toHaveBeenCalled()
  expect.soft(serverConnectionListener).not.toHaveBeenCalled()
  expect.soft(endListener).not.toHaveBeenCalled()
  expect
    .soft(interceptorConnectionListener)
    .toHaveBeenCalledExactlyOnceWith(expect.any(net.Socket))

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
})
