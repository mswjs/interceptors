/**
 * @see https://github.com/mswjs/interceptors/issues/682
 */
// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()
const server = new Server(51678)

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await new Promise<void>((resolve, reject) => {
    server.disconnectSockets()
    server.close((error) => {
      if (error) reject(error)
      resolve()
    })
  })
})

it('bypasses a WebSocket upgrade request', async () => {
  const client = io(`http://localhost:51678`, {
    transports: ['websocket'],
  })

  await vi.waitFor(async () => {
    expect(client.connected).toBe(true)
  })
})
