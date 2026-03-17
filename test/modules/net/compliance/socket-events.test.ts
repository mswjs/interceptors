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

it('emits correct events for a passthrough connection', async () => {
  const serverConnectionListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      serverConnectionListener(socket)
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect.poll(() => listeners.connect).toHaveBeenCalledOnce()
  expect.soft(socket.connecting).toBe(false)
  expect
    .soft(events)
    .toEqual([
      ['connectionAttempt', server.hostname, server.port, 4],
      ['connect'],
      ['ready'],
      ['end'],
      ['close', false],
    ])

  expect(socket.connecting).toBe(false)
})
