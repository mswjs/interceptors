// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { getWsUrl } from '../utils/getWsUrl'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('restores the global WebSocket class after the interceptor is disposed', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com')

  await vi.waitFor(() => {
    expect(connectionListener).toHaveBeenCalledTimes(1)
  })

  interceptor.dispose()

  const socket = new WebSocket(getWsUrl(wsServer))
  const openListener = vi.fn()
  socket.onopen = openListener

  await vi.waitFor(() => {
    expect(openListener).toHaveBeenCalledTimes(1)
  })
})
