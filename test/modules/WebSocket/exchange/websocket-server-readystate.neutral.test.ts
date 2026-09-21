import {
  WebSocketInterceptor,
  type WebSocketServerConnection,
} from '@mswjs/interceptors/WebSocket'
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

it('equals CLOSED until connected to the original server', async () => {
  const serverPromise = Promise.withResolvers<WebSocketServerConnection>()
  interceptor.once('connection', ({ server }) => {
    serverPromise.resolve(server)
  })

  new WebSocket('wss://example.com')
  const serverConnection = await serverPromise.promise

  expect(serverConnection.readyState).toBe(WebSocket.CLOSED)
})

it('reflects the state of the original server connection', async () => {
  const readyStates: Array<number> = []
  const serverPromise = Promise.withResolvers<WebSocketServerConnection>()
  interceptor.once('connection', ({ server }) => {
    readyStates.push(server.readyState)
    server.connect()
    readyStates.push(server.readyState)
    server.addEventListener('open', () => {
      readyStates.push(server.readyState)
      serverPromise.resolve(server)
    })
  })

  const ws = new WebSocket(server.ws.url('/'))
  onTestFinished(() => ws.close())
  const serverConnection = await serverPromise.promise

  expect(readyStates).toEqual([
    WebSocket.CLOSED,
    WebSocket.CONNECTING,
    WebSocket.OPEN,
  ])

  serverConnection.close()

  await vi.waitFor(() => {
    expect(serverConnection.readyState).toBe(WebSocket.CLOSED)
  })
})
