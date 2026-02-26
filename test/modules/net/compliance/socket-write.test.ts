// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import net from 'node:net'
import { SocketInterceptor } from '../../../../src/interceptors/net'

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

it('emits "data" on the server socket for writes before connect', async () => {
  const interceptorDataListener = vi.fn()

  interceptor.on('connection', ({ socket }) => {
    socket.on('data', interceptorDataListener)
  })

  const socket = net.connect(80, 'any.host.com')
  const closeListener = vi.fn()

  socket.on('close', closeListener)
  socket.write('hello', () => socket.destroy())

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  await expect
    .poll(() => interceptorDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('hello'))
})

it('emits "data" on the server socket for writes after connect', async () => {
  const interceptorDataListener = vi.fn()

  interceptor.on('connection', ({ socket }) => {
    socket.on('data', interceptorDataListener)
  })

  const socket = net.connect(80, 'any.host.com')
  const closeListener = vi.fn()

  socket
    .on('connect', () => {
      socket.write('hello', () => socket.destroy())
    })
    .on('close', closeListener)

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
  expect(interceptorDataListener).toHaveBeenCalledExactlyOnceWith(
    Buffer.from('hello')
  )
})
