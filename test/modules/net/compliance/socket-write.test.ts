// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer, spyOnSocket } from '#/test/helpers'
import { setTimeout } from 'node:timers/promises'

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

it('intercepts buffered writes for passthrough socket', async () => {
  const serverDataListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', serverDataListener)
    })
  })

  const interceptorDataListener = vi.fn()
  interceptor.on('connection', ({ socket, controller }) => {
    controller.passthrough()
    socket.on('data', interceptorDataListener)
  })

  const socket = net.connect(server.port, server.hostname)

  // Writing multiple chunks before socket connects buffers them into a single write.
  socket.write('hello ')
  socket.write('from ')
  socket.end('client')

  await expect
    .poll(() => serverDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('hello from client'))

  // Interceptor "data" events aren't buffered since the connection is pending.
  expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3)
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('hello '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('from '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('client'))
})

it('intercepts separate writes for passthrough socket', async () => {
  const serverDataListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', serverDataListener)
    })
  })

  const interceptorDataListener = vi.fn()
  interceptor.on('connection', async ({ socket, controller }) => {
    socket.on('data', interceptorDataListener)

    setTimeout(30)
    controller.passthrough()
  })

  const socket = net.connect(server.port, server.hostname)

  socket.write('hello ')
  await setTimeout(20)
  socket.write('from ')
  await setTimeout(20)
  socket.end('client')

  await expect.poll(() => serverDataListener).toHaveBeenCalledTimes(3)
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('hello '))
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('from '))
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('client'))

  expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3)
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('hello '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('from '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('client'))
})

it('does not duplicate writes while the socket is pending', async () => {
  const serverDataListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', serverDataListener)
    })
  })

  const interceptorDataListener = vi.fn()
  interceptor.on('connection', async ({ socket, controller }) => {
    socket.on('data', interceptorDataListener)

    socket.on('data', (chunk) => {
      if (chunk.toString() === 'hello ') {
        controller.passthrough()
      }
    })
  })

  const socket = net.connect(server.port, server.hostname)

  socket.write('hello ')
  await setTimeout(20)
  socket.write('from ')
  await setTimeout(20)
  socket.end('client')

  await expect.poll(() => serverDataListener).toHaveBeenCalledTimes(3)
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('hello '))
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('from '))
  expect
    .soft(serverDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('client'))

  expect.soft(interceptorDataListener).toHaveBeenCalledTimes(3)
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(1, Buffer.from('hello '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(2, Buffer.from('from '))
  expect
    .soft(interceptorDataListener)
    .toHaveBeenNthCalledWith(3, Buffer.from('client'))
})
