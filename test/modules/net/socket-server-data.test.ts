// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { spyOnSocket } from '#/test/helpers'

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
  const { listeners, events } = spyOnSocket(socket)

  socket.write('hello', () => socket.destroy())

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([['close', false]])
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
  const { listeners, events } = spyOnSocket(socket)

  socket.on('connect', () => {
    socket.write('hello', () => socket.destroy())
  })

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([['connect'], ['close', false]])
  await expect
    .poll(() => interceptorDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('hello'))
})

it('emits "data" on the server for nested writes', async () => {
  const interceptorDataListener = vi.fn()

  interceptor.on('connection', ({ socket, controller }) => {
    socket.on('data', interceptorDataListener)

    socket.on('data', (chunk) => {
      if (chunk.toString() === 'three') {
        socket.destroy()
      }
    })
  })

  const socket = net.connect(80, 'any.host.com')
  const { listeners } = spyOnSocket(socket)

  socket.write('one', () => {
    socket.write('two', () => {
      socket.end('three')
    })
  })

  await expect
    .poll(() => interceptorDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('one'))
  await expect
    .poll(() => interceptorDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('two'))
  await expect
    .poll(() => interceptorDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('three'))

  expect(listeners.close).toHaveBeenCalledOnce()
})
