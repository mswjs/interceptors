import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
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

it('dispatches the "open" event once the mocked connection is open', async () => {
  const openListener = vi.fn<(event: Event, readyState: number) => void>()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('open', (event) => {
      openListener(event, client.socket.readyState)
    })
  })

  const ws = new WebSocket('wss://example.com')

  await vi.waitFor(() => {
    expect(openListener).toHaveBeenCalledOnce()
  })

  const [event, readyState] = openListener.mock.calls[0]
  expect(event.type).toBe('open')
  expect(event.target).toBe(ws)
  expect(readyState).toBe(WebSocket.OPEN)
})

it('dispatches the "open" event once when connected to the original server', async () => {
  const openListener = vi.fn<(event: Event) => void>()
  const messageListener = vi.fn<(event: MessageEvent) => void>()
  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    client.addEventListener('open', openListener)
  })

  const ws = new WebSocket(server.ws.url('/?greet'))
  ws.onmessage = messageListener

  await vi.waitFor(() => {
    // The original server has greeted the client by now.
    expect(messageListener).toHaveBeenCalledOnce()
  })
  expect(openListener).toHaveBeenCalledOnce()

  ws.close()
})

it('dispatches the "open" event before any "message" event', async () => {
  const eventLog: Array<string> = []
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('open', () => eventLog.push('open'))
    client.addEventListener('message', () => eventLog.push('message'))
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.send('hello')

  await vi.waitFor(() => {
    expect(eventLog).toEqual(['open', 'message'])
  })
})
