/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { getWsUrl } from '../utils/getWsUrl'
import { REQUEST_ID_REGEXP } from '../../../helpers'
import { waitForNextTick } from '../utils/waitForNextTick'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  wsServer.clients.forEach((client) => client.close())
})

afterAll(async () => {
  interceptor.dispose()
  wsServer.close()
})

it('emits the correct "connection" event on the interceptor', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com')

  // Must not emit the "connection" event on this tick.
  expect(connectionListener).toHaveBeenCalledTimes(0)

  await waitForNextTick()

  // Must emit the "connection" event on the next tick
  // so the client can modify the WebSocket instance meanwhile.
  expect(connectionListener).toHaveBeenCalledTimes(1)
  expect(connectionListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      client: expect.objectContaining({
        id: expect.stringMatching(REQUEST_ID_REGEXP),
        send: expect.any(Function),
        addEventListener: expect.any(Function),
        removeEventListener: expect.any(Function),
        close: expect.any(Function),
      }),
      server: expect.objectContaining({
        send: expect.any(Function),
        addEventListener: expect.any(Function),
        removeEventListener: expect.any(Function),
      }),
      info: {
        protocols: undefined,
      },
    })
  )
})

it('does not connect to the actual WebSocket server by default', async () => {
  const realConnectionListener = vi.fn()
  wsServer.on('connection', realConnectionListener)

  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket(getWsUrl(wsServer))
  await waitForNextTick()

  expect(connectionListener).toHaveBeenCalledTimes(1)
  expect(realConnectionListener).not.toHaveBeenCalled()
})

it('includes connection information in the "connection" event payload', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com', ['protocol1', 'protocol2'])
  await waitForNextTick()

  expect(connectionListener).toHaveBeenCalledTimes(1)
  expect(connectionListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      info: {
        // Preserves the client protocols as-is.
        protocols: ['protocol1', 'protocol2'],
      },
    })
  )
})
