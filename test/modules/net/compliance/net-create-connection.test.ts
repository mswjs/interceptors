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

it('emits correct events for a bypassed "net.createConnection()" connection', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end('hello from server')
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.createConnection(
    server.port,
    server.hostname,
    connectionCallback
  )
  const { listeners, events } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from server')],
    ['end'],
    ['close', false],
  ])
  expect(connectionCallback).toHaveBeenCalledOnce()
})
