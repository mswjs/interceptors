/**
 * @see https://github.com/mswjs/interceptors/issues/682
 */
import { io } from 'socket.io-client'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('bypasses a WebSocket upgrade request', async () => {
  const client = io(server.io.href, {
    transports: ['websocket'],
  })
  onTestFinished(() => {
    client.disconnect()
  })

  await expect.poll(() => client.connected).toBe(true)
})
