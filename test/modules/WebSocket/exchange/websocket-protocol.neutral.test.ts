import {
  WebSocketInterceptor,
  WebSocketServerConnection,
  WebSocketProtocol,
  type WebSocketData,
  type WebSocketProtocolContext,
  type WebSocketProtocolMessageContext,
} from '@mswjs/interceptors/WebSocket'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

// Data on the wire is uppercase, data in the connection listeners is lowercase.
class Uppercase extends WebSocketProtocol<string> {
  public encode(data: string): string {
    return data.toUpperCase()
  }

  public decode(data: WebSocketData): string | undefined {
    return typeof data === 'string' ? data.toLowerCase() : undefined
  }
}

const protocol = new Uppercase()

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
    client.protocol = protocol
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
    client.protocol = protocol
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
    server.protocol = protocol
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

it('throws when sending to the unconnected server even if the protocol drops the message', async () => {
  const encode = vi.fn<() => undefined>(() => undefined)
  const serverPromise = Promise.withResolvers<WebSocketServerConnection>()
  interceptor.once('connection', ({ server }) => {
    server.protocol = { encode, decode: (data) => data }
    serverPromise.resolve(server)
  })

  new WebSocket('wss://example.com')
  const server = await serverPromise.promise

  expect(() => server.send('hello')).toThrow(
    'Failed to call "server.send()" for "wss://example.com/": the connection is not open. Did you forget to call "server.connect()"?'
  )
  expect(encode).not.toHaveBeenCalled()
})

it('decodes data received from the original server', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  const onServerData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.protocol = protocol
    server.protocol = protocol
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
    client.protocol = {
      encode: (data) => data,
      // Treat frames starting with "#" as protocol control frames.
      decode: (data) =>
        typeof data === 'string' && !data.startsWith('#') ? data : undefined,
    }
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
    client.protocol = protocol
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
    client.protocol = new (class extends WebSocketProtocol<string> {
      // Send every word of the message as a separate frame.
      public *encode(data: string): Generator<string, string> {
        const [first, second] = data.split(' ')
        yield first
        return second
      }

      public decode(data: WebSocketData): string | undefined {
        return typeof data === 'string' ? data : undefined
      }
    })()
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
    client.protocol = {
      encode: (data) => data,
      // Treat every comma-separated value as a separate message.
      *decode(data) {
        if (typeof data === 'string') {
          yield* data.split(',')
        }
      },
    }
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

it('sends the handshake once the mocked connection opens', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client }) => {
    client.protocol = new (class extends Uppercase {
      public *handshake(): Generator<string> {
        yield 'HELLO'
        yield 'WORLD'
      }
    })()
    // Anything sent from the "open" listener must follow the handshake.
    client.addEventListener('open', () => client.send('ready'))
  })

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    expect(onSocketData).toHaveBeenCalledTimes(3)
  })
  // The handshake frames are raw (not encoded).
  expect(onSocketData).toHaveBeenNthCalledWith(1, 'HELLO')
  expect(onSocketData).toHaveBeenNthCalledWith(2, 'WORLD')
  expect(onSocketData).toHaveBeenNthCalledWith(3, 'READY')
})

it('does not send the handshake when connected to the original server', async () => {
  const handshake = vi.fn<() => string>(() => 'HANDSHAKE')
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', ({ client, server }) => {
    client.protocol = new (class extends Uppercase {
      public handshake = handshake
    })()
    server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?greet'))
  ws.onmessage = (event) => onSocketData(event.data)

  await vi.waitFor(() => {
    // The original server sent its own greeting.
    expect(onSocketData).toHaveBeenCalledExactlyOnceWith('hello world')
  })
  expect(handshake).not.toHaveBeenCalled()

  ws.close()
})

it('exposes the connection context to the protocol methods', async () => {
  const encode = vi.fn<
    (data: string, context: WebSocketProtocolMessageContext) => string
  >((data) => data)
  const decode = vi.fn<
    (
      data: unknown,
      context: WebSocketProtocolMessageContext
    ) => string | undefined
  >((data) => (typeof data === 'string' ? data : undefined))
  const handshake = vi.fn<(context: WebSocketProtocolContext) => undefined>(
    () => undefined
  )
  const connectionPromise = Promise.withResolvers<WebSocketProtocolContext>()

  interceptor.once('connection', ({ client, server, info }) => {
    client.protocol = { encode, decode, handshake }
    client.addEventListener('open', () => client.send('hello'))
    connectionPromise.resolve({ client, server, info })
  })

  const ws = new WebSocket('wss://example.com', ['chat'])
  ws.onopen = () => ws.send('hello')

  const { client, server } = await connectionPromise.promise

  await vi.waitFor(() => {
    expect(handshake).toHaveBeenCalledOnce()
    expect(encode).toHaveBeenCalledOnce()
    expect(decode).toHaveBeenCalledOnce()
  })

  const [handshakeContext] = handshake.mock.calls[0]
  expect(handshakeContext.client).toBe(client)
  expect(handshakeContext.server).toBe(server)
  expect(handshakeContext.info).toEqual({ protocols: ['chat'] })

  const [, encodeContext] = encode.mock.calls[0]
  expect(encodeContext.connection).toBe(client)
  expect(encodeContext.client).toBe(client)
  expect(encodeContext.server).toBe(server)
  expect(encodeContext.info).toEqual({ protocols: ['chat'] })

  const [, decodeContext] = decode.mock.calls[0]
  expect(decodeContext.connection).toBe(client)
  expect(decodeContext.info).toEqual({ protocols: ['chat'] })
})
