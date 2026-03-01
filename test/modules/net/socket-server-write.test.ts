// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer, spyOnSocket } from '#/test/helpers'

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

it('writes to a claimed socket', async () => {
  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()
    socket.write('hello from server')
  })

  const socket = net.connect(80, '127.0.0.1')
  const { listeners, events } = spyOnSocket(socket)

  socket.on('data', () => socket.destroy())

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from server')],
    ['close', false],
  ])
})

it('writes and immediately ends a claimed socket', async () => {
  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()
    socket.write('hello from server')
    socket.end()
  })

  const socket = net.connect(80, '127.0.0.1')
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from server')],
    ['end'],
    ['close', false],
  ])
})

it('writes to a passthrough socket from the interceptor', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.write('hello from server')
      socket.end()
    })
  })

  interceptor.on('connection', ({ socket, controller }) => {
    controller.passthrough()
    socket.write('hello from interceptor')
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from interceptor')],
    ['data', Buffer.from('hello from server')],
    ['end'],
    ['close', false],
  ])
})

it('writes and immediately ends a passthrough socket', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.write('hello from server')
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from server')],
    ['end'],
    ['close', false],
  ])
})
