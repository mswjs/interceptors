import {
  WebSocketInterceptor,
  WebSocketProtocol,
  type WebSocketData,
  type WebSocketProtocolContext,
} from '@mswjs/interceptors/WebSocket'

// Applies to connections on the "/upper" path only.
class Uppercase extends WebSocketProtocol<string> {
  public match({ client }: WebSocketProtocolContext): boolean {
    return client.url.pathname === '/upper'
  }

  public encode(data: string): string {
    return data.toUpperCase()
  }

  public decode(data: WebSocketData): string | undefined {
    return typeof data === 'string' ? data.toLowerCase() : undefined
  }

  public handshake(): string {
    return 'WELCOME'
  }
}

const uppercase = new Uppercase()

const interceptor = new WebSocketInterceptor({
  protocols: [uppercase],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('applies the matching protocol to the connection', async () => {
  const onConnection = vi.fn<(...protocols: Array<unknown>) => void>()
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    onConnection(client.protocol, server.protocol)
    client.addEventListener('message', (event) => {
      onClientData(event.data)
      client.send('hi')
    })
  })

  const ws = new WebSocket('wss://example.com/upper')
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('HELLO')

  await expect
    .poll(() => onConnection)
    .toHaveBeenCalledExactlyOnceWith(uppercase, uppercase)
  await expect.poll(() => onClientData).toHaveBeenCalledExactlyOnceWith('hello')
  await expect.poll(() => onSocketData).toHaveBeenCalledTimes(2)
  expect.soft(onSocketData).toHaveBeenNthCalledWith(1, 'WELCOME')
  expect.soft(onSocketData).toHaveBeenNthCalledWith(2, 'HI')
})

it('leaves connections that match no protocol untouched', async () => {
  const onConnection = vi.fn<(...protocols: Array<unknown>) => void>()
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    onConnection(client.protocol, server.protocol)
    client.addEventListener('message', (event) => {
      onClientData(event.data)
      client.send('hi')
    })
  })

  const ws = new WebSocket('wss://example.com/plain')
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('HELLO')

  await expect
    .poll(() => onConnection)
    .toHaveBeenCalledExactlyOnceWith(undefined, undefined)
  await expect.poll(() => onClientData).toHaveBeenCalledExactlyOnceWith('HELLO')
  await expect.poll(() => onSocketData).toHaveBeenCalledExactlyOnceWith('hi')
})
