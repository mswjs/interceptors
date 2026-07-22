import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/wait-for-web-socket-event'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('returns an empty string if no protocol was provided (mocked)', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('wss://localhost')
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('')
})

it('returns an empty string if no protocol was provided (original)', async () => {
  const ws = new WebSocket(server.ws.url())
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('')

  ws.close()
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
  const ws = new WebSocket(server.ws.url(), 'chat')

  // The protocol is empty on the first tick.
  // This is where the client is waiting for the "server"
  // to report back what protocol was chosen.
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('chat')

  ws.close()
})

it('returns the first protocol from the array of provided protocols (mocked)', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('wss://localhost', ['superchat', 'chat'])
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('superchat')
})

it('returns the first protocol from the array of provided protocols (original)', async () => {
  const ws = new WebSocket(server.ws.url(), ['superchat', 'chat'])
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('superchat')

  ws.close()
})
