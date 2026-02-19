// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import net from 'node:net'
import { SocketInterceptor } from '../../../src/interceptors/net'

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

it('mocks the intercepted connection', async () => {
  const serverDataListener = vi.fn()

  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()

    socket.write('hello from server')
    socket.on('data', serverDataListener)
  })

  const connectionListener = vi.fn()
  const socket = net.connect(3000, '127.0.0.1', connectionListener)

  const errorListener = vi.fn()
  socket.on('error', errorListener)

  const clientDataListener = vi.fn()
  socket.on('data', clientDataListener)

  socket.on('connect', () => {
    socket.write('hello from client')
  })

  await expect.poll(() => connectionListener).toHaveBeenCalled()
  expect(errorListener).not.toHaveBeenCalled()
  expect(serverDataListener).toHaveBeenCalledExactlyOnceWith(
    Buffer.from('hello from client')
  )
  expect(clientDataListener).toHaveBeenCalledExactlyOnceWith(
    Buffer.from('hello from server')
  )
})

it('errors the intercepted socket before it connects', async () => {
  const reason = new Error('Custom reason')
  interceptor.on('connection', ({ controller }) => {
    controller.errorWith(reason)
  })

  const connectionCallback = vi.fn()
  const socket = net.connect(3000, '127.0.0.1', connectionCallback)

  const connectListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  socket.on('connect', connectListener)
  socket.on('error', errorListener)
  socket.on('close', closeListener)

  await expect.poll(() => errorListener).toHaveBeenCalled()
  expect.soft(errorListener).toHaveBeenCalledExactlyOnceWith(reason)
  expect.soft(closeListener).toHaveBeenCalledExactlyOnceWith(true)
  expect.soft(connectListener).not.toHaveBeenCalled()
  expect.soft(connectionCallback).not.toHaveBeenCalled()
})
