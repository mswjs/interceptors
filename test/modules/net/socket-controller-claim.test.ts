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

it('resolves the connection attempt when the socket is claimed', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = net.connect(80, '127.0.0.1')
  const { listeners, events } = spyOnSocket(socket)

  socket.on('connect', () => socket.destroy())

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['close', false],
  ])
})

it('throws an error claiming an already claimed connection', async () => {
  expect.assertions(3)

  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()

    expect(() => controller.claim()).toThrow(
      `Failed to claim a socket connection: already handled (1)`
    )

    socket.end()
  })

  const socket = net.connect(80, '127.0.0.1')
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['end'],
    ['close', false],
  ])
})

it('throws an error claiming an already passthrough connection', async () => {
  expect.assertions(3)

  interceptor.on('connection', ({ controller }) => {
    controller.passthrough()

    expect(() => controller.claim()).toThrow(
      `Failed to claim a socket connection: already handled (2)`
    )
  })

  await using server = await createTestServer(() => {
    return new net.Server((socket) => socket.end())
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['end'],
    ['close', false],
  ])
})
