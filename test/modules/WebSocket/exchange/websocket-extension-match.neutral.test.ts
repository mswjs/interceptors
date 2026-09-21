import {
  WebSocketInterceptor,
  WebSocketExtension,
  type WebSocketData,
  type WebSocketExtensionContext,
} from '@mswjs/interceptors/WebSocket'

// Applies to connections on the "/upper" path only.
class Uppercase extends WebSocketExtension<string, { greeting: string }> {
  public match({ client }: WebSocketExtensionContext): boolean {
    return client.url.pathname === '/upper'
  }

  public encode(data: string): string {
    return data.toUpperCase()
  }

  public decode(data: WebSocketData): string | undefined {
    return typeof data === 'string' ? data.toLowerCase() : undefined
  }

  public connect(): string {
    return 'WELCOME'
  }

  public extend({ client }: WebSocketExtensionContext): { greeting: string } {
    return { greeting: `welcome to ${client.url.pathname}` }
  }
}

const uppercase = new Uppercase()

const interceptor = new WebSocketInterceptor({
  extensions: [uppercase],
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

it('applies the matching extension to the connection', async () => {
  const onConnection = vi.fn<(...protocols: Array<unknown>) => void>()
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    onConnection(client.extension, server.extension)
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

it('leaves connections that match no extension untouched', async () => {
  const onConnection = vi.fn<(...protocols: Array<unknown>) => void>()
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    onConnection(client.extension, server.extension)
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

it('exposes the extension API on the connection event', async () => {
  const onConnection = vi.fn<(extension: unknown) => void>()
  interceptor.once('connection', (connection) => {
    onConnection(connection.greeting)
  })

  const ws = new WebSocket('wss://example.com/upper')
  onTestFinished(() => ws.close())

  await expect
    .poll(() => onConnection)
    .toHaveBeenCalledExactlyOnceWith('welcome to /upper')
})
