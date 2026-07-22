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

it('emits a MessageEvent on incoming server message', async () => {
  const serverMessageListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', serverMessageListener)
  })

  const url = server.ws.url('/?greet')
  const clientMessageListener = vi.fn()
  const ws = new WebSocket(url)
  ws.onmessage = (event) => clientMessageListener(event)

  // Must dispatch the correct incoming server MessageEvent.
  await vi.waitFor(() => {
    expect(serverMessageListener).toHaveBeenCalledTimes(1)
    const event = serverMessageListener.mock.calls[0][0] as MessageEvent

    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hello world')
    expect(event.origin).toBe(url.origin)
    expect(event.cancelable).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  // Must dispatch the correct received client MessageEvent.
  await vi.waitFor(() => {
    expect(clientMessageListener).toBeCalledTimes(1)

    const event = clientMessageListener.mock.calls[0][0] as MessageEvent
    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hello world')
    expect(event.origin).toBe(url.origin)
  })

  ws.close()
})

it('prevents the default server-to-client message forwarding', async () => {
  const serverMessageListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', (event) => {
      event.preventDefault()
      serverMessageListener()
    })
  })

  const clientMessageListener = vi.fn()
  const ws = new WebSocket(server.ws.url('/?greet'))
  ws.onmessage = (event) => clientMessageListener(event)

  await vi.waitFor(() => {
    expect(serverMessageListener).toHaveBeenCalledTimes(1)
    expect(clientMessageListener).not.toHaveBeenCalled()
  })

  ws.close()
})
