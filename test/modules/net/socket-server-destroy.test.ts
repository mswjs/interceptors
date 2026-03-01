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

it('ends the connection before it is open', async () => {
  const reason = new Error('Custom reason')
  interceptor.on('connection', ({ socket }) => {
    socket.destroy(reason)
  })

  const socket = net.connect(80, '127.0.0.1')
  const { events, listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
  expect(socket.closed).toBe(true)
  expect(events).toEqual([
    ['error', reason],
    ['close', true],
  ])
})

it('ends a mocked connection after it is open', async () => {
  const reason = new Error('Custom reason')
  interceptor.on('connection', ({ socket, controller }) => {
    socket.on('connect', () => socket.destroy(reason))
    controller.claim()
  })

  const socket = net.connect(80, '127.0.0.1')
  const { events, listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['error', reason],
    ['close', true],
  ])
})

it('ends a passthrough connection after it is open', async () => {
  const reason = new Error('Custom reason')
  interceptor.on('connection', ({ socket, controller }) => {
    socket.on('connect', () => socket.destroy(reason))
    controller.passthrough()
  })

  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { events, listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
  expect(socket.closed).toBe(true)
  expect(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['error', reason],
    ['close', true],
  ])
})

it('ends the connection during a write', async () => {
  const reason = new Error('Custom reason')
  interceptor.on('connection', ({ socket, controller }) => {
    socket.on('data', () => socket.destroy(reason))
    controller.claim()
  })

  const socket = net.connect(80, '127.0.0.1')
  const { events, listeners } = spyOnSocket(socket)

  socket.on('connect', () => socket.write('hello'))

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
  expect(socket.closed).toBe(true)
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['error', reason],
    ['close', true],
  ])
})

it('has no effect if the client closed the connection', async () => {
  const serverReason = new Error('Server reason')
  interceptor.on('connection', ({ socket }) => {
    socket.destroy(serverReason)
  })

  const socket = net.connect(80, '127.0.0.1')
  const { events, listeners } = spyOnSocket(socket)

  const clientReason = new Error('Client reason')
  socket.destroy(clientReason)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(socket.connecting).toBe(false)
  expect(socket.closed).toBe(true)
  expect(events).toEqual([
    ['error', clientReason],
    ['close', true],
  ])
})
