/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
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

afterEach(() => {
  interceptor.removeAllListeners()
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('emits "open" event when the server connection is open', async () => {
  const serverOpenListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('open', serverOpenListener)
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })
})

it('emits "open" event if the listener was added before calling "connect()"', async () => {
  const serverOpenListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.addEventListener('open', serverOpenListener)
    server.connect()
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })
})
