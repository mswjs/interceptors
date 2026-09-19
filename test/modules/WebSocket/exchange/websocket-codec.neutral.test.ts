import {
  WebSocketInterceptor,
  defineWebSocketCodec,
} from '@mswjs/interceptors/WebSocket'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

// Data on the wire is uppercase, data in the connection listeners is lowercase.
const codec = defineWebSocketCodec<string>({
  encode: (data) => data.toUpperCase(),
  decode: (data) => (typeof data === 'string' ? data.toLowerCase() : undefined),
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

it('encodes data sent to the client', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client }) => {
    client.codec = codec
    client.send('hello')
  })

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('HELLO')
  })
})

it('decodes data received from the client', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client }) => {
    client.codec = codec
    client.addEventListener('message', (event) => onClientData(event.data))
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.send('HELLO')

  await vi.waitFor(() => {
    expect(onClientData).toHaveBeenCalledExactlyOnceWith('hello')
  })
})

it('encodes data sent to the original server', async () => {
  const onServerData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ server }) => {
    server.codec = codec
    server.connect()
    server.addEventListener('message', (event) => onServerData(event.data))
    server.send('hello')
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    // The original server received the encoded frame and echoed it back.
    expect(onServerData).toHaveBeenCalledExactlyOnceWith('hello')
    // The echoed frame is forwarded to the client as-is.
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('HELLO')
  })

  ws.close()
})

it('decodes data received from the original server', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  const onServerData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.codec = codec
    server.codec = codec
    server.connect()
    client.addEventListener('message', (event) => onClientData(event.data))
    server.addEventListener('message', (event) => onServerData(event.data))
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('HELLO')

  await vi.waitFor(() => {
    expect(onClientData).toHaveBeenCalledExactlyOnceWith('hello')
    // The raw client frame was forwarded to the original server,
    // which echoed it back.
    expect(onServerData).toHaveBeenCalledExactlyOnceWith('hello')
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('HELLO')
  })

  ws.close()
})

it('forwards frames that decode into nothing', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.codec = defineWebSocketCodec<string>({
      encode: (data) => data,
      // Treat frames starting with "#" as protocol control frames.
      decode: (data) =>
        typeof data === 'string' && !data.startsWith('#') ? data : undefined,
    })
    server.connect()
    client.addEventListener('message', (event) => onClientData(event.data))
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('#ping')

  await vi.waitFor(() => {
    // The control frame still reached the original server (and got echoed).
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('#ping')
  })
  // But it was never dispatched as a message on the client connection.
  expect(onClientData).not.toHaveBeenCalled()

  ws.close()
})

it('prevents forwarding a frame when its decoded message is prevented', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.codec = codec
    server.connect()
    client.addEventListener('message', (event) => {
      if (event.data === 'secret') {
        event.preventDefault()
      }
    })
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => {
    ws.send('SECRET')
    ws.send('PUBLIC')
  }

  await vi.waitFor(() => {
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('PUBLIC')
  })

  ws.close()
})

it('encodes a single message into multiple frames', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client }) => {
    client.codec = defineWebSocketCodec<string>({
      // Send every word of the message as a separate frame.
      encode: function* (data) {
        const [first, second] = data.split(' ')
        yield first
        return second
      },
      decode: (data) => (typeof data === 'string' ? data : undefined),
    })
    client.send('hello world')
  })

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    expect(onSocketData).toHaveBeenCalledTimes(2)
  })
  expect(onSocketData).toHaveBeenNthCalledWith(1, 'hello')
  expect(onSocketData).toHaveBeenNthCalledWith(2, 'world')
})

it('decodes a single frame into multiple messages', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client }) => {
    client.codec = defineWebSocketCodec<string>({
      encode: (data) => data,
      // Treat every comma-separated value as a separate message.
      decode: function* (data) {
        if (typeof data === 'string') {
          yield* data.split(',')
        }
      },
    })
    client.addEventListener('message', (event) => onClientData(event.data))
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.send('hello,world')

  await vi.waitFor(() => {
    expect(onClientData).toHaveBeenCalledTimes(2)
  })
  expect(onClientData).toHaveBeenNthCalledWith(1, 'hello')
  expect(onClientData).toHaveBeenNthCalledWith(2, 'world')
})

it('calls the "open" hook once the mocked connection is open', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  const onOpen = vi.fn<NonNullable<typeof codec.open>>((_, send) => {
    send('welcome')
  })
  interceptor.once('connection', ({ client }) => {
    client.codec = { ...codec, open: onOpen }
  })

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    // Frames sent from the "open" hook are raw (not encoded).
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('welcome')
  })
  expect(onOpen).toHaveBeenCalledOnce()
  expect(onOpen.mock.calls[0][0]).toMatchObject({ url: new URL(ws.url) })
})

it('does not call the "open" hook when connected to the original server', async () => {
  const onOpen = vi.fn<NonNullable<typeof codec.open>>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.codec = { ...codec, open: onOpen }
    server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?greet'))
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('hello world')
  })
  expect(onOpen).not.toHaveBeenCalled()

  ws.close()
})

it('calls the "close" hook once the connection is closed', async () => {
  const onClose = vi.fn<NonNullable<typeof codec.close>>()
  interceptor.once('connection', ({ client }) => {
    client.codec = { ...codec, close: onClose }
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.close()

  await vi.waitFor(() => {
    expect(onClose).toHaveBeenCalledOnce()
  })
  expect(onClose.mock.calls[0][0]).toMatchObject({ url: new URL(ws.url) })
})
