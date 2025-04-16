/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-close
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { getWsUrl } from '../utils/getWsUrl'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
  handleProtocols(protocols) {
    /**
     * @fixme Server must choose just ONE protocol.
     * This is a workaround to make Undici work in Node.js v18.
     * @see https://github.com/nodejs/undici/issues/2844
     */
    return Array.from(protocols)[0]
  },
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

it('returns an empty string if no protocol was provided (mocked)', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('wss://localhost')
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('')
})

it('returns an empty string if no protocol was provided (original)', async () => {
  const ws = new WebSocket(getWsUrl(wsServer))
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('')
})

it('returns the protocol if a single protocol was provided (mocked)', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('wss://localhost', 'chat')

  // The protocol is empty on the first tick.
  // This is where the client is waiting for the "server"
  // to report back what protocol was chosen.
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('chat')
})

it('returns the protocol if a single protocol was provided (original)', async () => {
  const ws = new WebSocket(getWsUrl(wsServer), 'chat')

  // The protocol is empty on the first tick.
  // This is where the client is waiting for the "server"
  // to report back what protocol was chosen.
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('chat')
})

it('returns the first protocol from the array of provided protocols (mocked)', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('wss://localhost', ['superchat', 'chat'])
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('superchat')
})

it('returns the first protocol from the array of provided protocols (original)', async () => {
  const ws = new WebSocket(getWsUrl(wsServer), ['superchat', 'chat'])
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)

  expect(ws.protocol).toBe('superchat')
})
