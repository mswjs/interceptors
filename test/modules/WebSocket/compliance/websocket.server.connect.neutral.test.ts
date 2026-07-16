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

it('forwards client messages to the server by default', async () => {
  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  // The actual server echoes the received messages.
  const echoListener = vi.fn<(data: string) => void>()
  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onopen = () => {
    ws.send('hello')
    ws.send('howdy')
  }
  ws.onmessage = (event) => echoListener(event.data)

  await vi.waitFor(() => {
    expect(echoListener).toHaveBeenCalledWith('hello')
    expect(echoListener).toHaveBeenCalledWith('howdy')
  })
  expect(echoListener).toHaveBeenCalledTimes(2)

  ws.close()
})

it('prevents client-to-server forwarding by calling "event.preventDefault()"', async () => {
  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    client.addEventListener('message', (event) => {
      if (event.data === 'prevent-this') {
        event.preventDefault()
      }
    })
  })

  const echoListener = vi.fn<(data: string) => void>()
  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onopen = () => {
    ws.send('hello')
    ws.send('prevent-this')
    ws.send('howdy')
  }
  ws.onmessage = (event) => echoListener(event.data)

  await vi.waitFor(() => {
    expect(echoListener).toHaveBeenCalledWith('hello')
    expect(echoListener).toHaveBeenCalledWith('howdy')
  })
  expect(echoListener).not.toHaveBeenCalledWith('prevent-this')

  ws.close()
})
