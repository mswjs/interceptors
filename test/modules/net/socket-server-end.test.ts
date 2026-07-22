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

it('ends the connection the same way the actual server does', async () => {
  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()
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
