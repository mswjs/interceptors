import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('restores the global WebSocket class after the interceptor is disposed', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com')

  await vi.waitFor(() => {
    expect(connectionListener).toHaveBeenCalledTimes(1)
  })

  interceptor.dispose()

  const socket = new WebSocket(server.ws.url())
  const openListener = vi.fn()
  socket.onopen = openListener

  await vi.waitFor(() => {
    expect(openListener).toHaveBeenCalledTimes(1)
  })

  socket.close()
})
