import {
  WebSocketInterceptor,
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

class UppercaseWithHandshake extends Uppercase {
  public *handshake(): Generator<string> {
    yield 'HELLO'
    yield 'WORLD'
  }
}

class Unencodable extends WebSocketProtocol {
  public encode(): never {
    throw new Error('Must not encode')
  }

  public decode(data: WebSocketData): WebSocketData {
    return data
  }
}

// Frames starting with "#" are protocol control frames, not messages.
class ControlFrames extends WebSocketProtocol {
  public encode(data: WebSocketData): WebSocketData {
    return data
  }

  public decode(data: WebSocketData): WebSocketData | undefined {
    return typeof data === 'string' && !data.startsWith('#') ? data : undefined
  }
}

// Every word of a message is sent as a separate frame.
class Words extends WebSocketProtocol<string> {
  public *encode(data: string): Generator<string, string> {
    const [first, second] = data.split(' ')
    yield first
    return second
  }

  public decode(data: WebSocketData): string | undefined {
    return typeof data === 'string' ? data : undefined
  }
}

// Every comma-separated value of a frame is a separate message.
class CommaSeparated extends WebSocketProtocol<string> {
  public encode(data: string): string {
    return data
  }

  public *decode(data: WebSocketData): Generator<string> {
    if (typeof data === 'string') {
      yield* data.split(',')
    }
  }
}

class Recording extends WebSocketProtocol<string> {
  public encodeContexts: Array<WebSocketProtocolMessageContext> = []
  public decodeContexts: Array<WebSocketProtocolMessageContext> = []
  public handshakeContexts: Array<WebSocketProtocolContext> = []

  public encode(
    data: string,
    context: WebSocketProtocolMessageContext
  ): string {
    this.encodeContexts.push(context)
    return data
  }

  public decode(
    data: WebSocketData,
    context: WebSocketProtocolMessageContext
  ): string | undefined {
    this.decodeContexts.push(context)
    return typeof data === 'string' ? data : undefined
  }

  public handshake(context: WebSocketProtocolContext): undefined {
    this.handshakeContexts.push(context)
  }
}

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
  interceptor.once('connection', (connection) => {
    new Uppercase().apply(connection)
    connection.client.send('hello')
  })

  const ws = new WebSocket('wss://example.com')
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect.poll(() => onSocketData).toHaveBeenCalledExactlyOnceWith('HELLO')
})

it('decodes data received from the client', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new Uppercase().apply(connection)
    connection.client.addEventListener('message', (event) => {
      onClientData(event.data)
    })
  })

  const ws = new WebSocket('wss://example.com')
  onTestFinished(() => ws.close())
  ws.onopen = () => ws.send('HELLO')

  await expect.poll(() => onClientData).toHaveBeenCalledExactlyOnceWith('hello')
})

it('encodes data sent to the original server', async () => {
  const onServerData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new Uppercase().apply(connection)
    connection.server.connect()
    connection.server.addEventListener('message', (event) => {
      onServerData(event.data)
    })
    connection.server.send('hello')
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect
    .poll(() => onServerData, { message: 'decodes the echoed frame' })
    .toHaveBeenCalledExactlyOnceWith('hello')
  await expect
    .poll(() => onSocketData, {
      message: 'the original server received the encoded frame',
    })
    .toHaveBeenCalledExactlyOnceWith('HELLO')
})

it('throws when sending to the unconnected server before encoding', async () => {
  const connectionPromise = Promise.withResolvers<WebSocketProtocolContext>()
  interceptor.once('connection', (connection) => {
    new Unencodable().apply(connection)
    connectionPromise.resolve(connection)
  })

  new WebSocket('wss://example.com')
  const { server } = await connectionPromise.promise

  expect(() => server.send('hello')).toThrow(
    'Failed to call "server.send()" for "wss://example.com/": the connection is not open. Did you forget to call "server.connect()"?'
  )
})

it('decodes data received from the original server', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  const onServerData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new Uppercase().apply(connection)
    connection.server.connect()
    connection.client.addEventListener('message', (event) => {
      onClientData(event.data)
    })
    connection.server.addEventListener('message', (event) => {
      onServerData(event.data)
    })
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('HELLO')

  await expect
    .poll(() => onClientData, { message: 'decodes the client frame' })
    .toHaveBeenCalledExactlyOnceWith('hello')
  await expect
    .poll(() => onServerData, { message: 'decodes the echoed frame' })
    .toHaveBeenCalledExactlyOnceWith('hello')
  await expect
    .poll(() => onSocketData, {
      message: 'the original server received the raw client frame',
    })
    .toHaveBeenCalledExactlyOnceWith('HELLO')
})

it('forwards frames that decode into nothing', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new ControlFrames().apply(connection)
    connection.server.connect()
    connection.client.addEventListener('message', (event) => {
      onClientData(event.data)
    })
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => ws.send('#ping')

  await expect
    .poll(() => onSocketData, {
      message: 'the original server received the control frame',
    })
    .toHaveBeenCalledExactlyOnceWith('#ping')
  expect(
    onClientData,
    'the control frame is not a message'
  ).not.toHaveBeenCalled()
})

it('prevents forwarding a frame when its decoded message is prevented', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new Uppercase().apply(connection)
    connection.server.connect()
    connection.client.addEventListener('message', (event) => {
      if (event.data === 'secret') {
        event.preventDefault()
      }
    })
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)
  ws.onopen = () => {
    ws.send('SECRET')
    ws.send('PUBLIC')
  }

  await expect
    .poll(() => onSocketData, {
      message: 'the original server received the public frame only',
    })
    .toHaveBeenCalledExactlyOnceWith('PUBLIC')
})

it('encodes a single message into multiple frames', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new Words().apply(connection)
    connection.client.send('hello world')
  })

  const ws = new WebSocket('wss://example.com')
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect.poll(() => onSocketData).toHaveBeenCalledTimes(2)
  expect.soft(onSocketData).toHaveBeenNthCalledWith(1, 'hello')
  expect.soft(onSocketData).toHaveBeenNthCalledWith(2, 'world')
})

it('decodes a single frame into multiple messages', async () => {
  const onClientData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new CommaSeparated().apply(connection)
    connection.client.addEventListener('message', (event) => {
      onClientData(event.data)
    })
  })

  const ws = new WebSocket('wss://example.com')
  onTestFinished(() => ws.close())
  ws.onopen = () => ws.send('hello,world')

  await expect.poll(() => onClientData).toHaveBeenCalledTimes(2)
  expect.soft(onClientData).toHaveBeenNthCalledWith(1, 'hello')
  expect.soft(onClientData).toHaveBeenNthCalledWith(2, 'world')
})

it('sends the handshake once the mocked connection opens', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new UppercaseWithHandshake().apply(connection)
    connection.client.addEventListener('open', () => {
      connection.client.send('ready')
    })
  })

  const ws = new WebSocket('wss://example.com')
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect.poll(() => onSocketData).toHaveBeenCalledTimes(3)
  expect
    .soft(onSocketData, 'the handshake frames are raw')
    .toHaveBeenNthCalledWith(1, 'HELLO')
  expect.soft(onSocketData).toHaveBeenNthCalledWith(2, 'WORLD')
  expect
    .soft(onSocketData, 'the message sent on open follows the handshake')
    .toHaveBeenNthCalledWith(3, 'READY')
})

it('does not send the handshake when connected to the original server', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', (connection) => {
    new UppercaseWithHandshake().apply(connection)
    connection.server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?greet'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect
    .poll(() => onSocketData, {
      message: 'receives the greeting from the original server only',
    })
    .toHaveBeenCalledExactlyOnceWith('hello world')
})

it('does not send the handshake when the original server connection has already closed', async () => {
  const onSocketData = vi.fn<(data: unknown) => void>()
  interceptor.once('connection', async (connection) => {
    new UppercaseWithHandshake().apply(connection)
    connection.server.connect()
    connection.server.addEventListener('close', (event) => {
      event.preventDefault()
    })
    await new Promise<void>((resolve) => {
      connection.server.addEventListener('close', () => resolve(), {
        once: true,
      })
    })
  })

  const ws = new WebSocket(server.ws.url('/?close'))
  onTestFinished(() => ws.close())
  ws.onmessage = (event) => onSocketData(event.data)

  await expect.poll(() => ws.readyState).toBe(WebSocket.OPEN)
  await new Promise((resolve) => setTimeout(resolve, 50))

  expect(
    onSocketData,
    'no handshake frames arrive after the original server closed'
  ).not.toHaveBeenCalled()
})

it('exposes the connection to the protocol', async () => {
  const protocol = new Recording()
  const connectionPromise = Promise.withResolvers<WebSocketProtocolContext>()
  interceptor.once('connection', (connection) => {
    protocol.apply(connection)
    connection.client.addEventListener('open', () => {
      connection.client.send('hello')
    })
    connectionPromise.resolve(connection)
  })

  const ws = new WebSocket('wss://example.com', ['chat'])
  onTestFinished(() => ws.close())
  ws.onopen = () => ws.send('hello')

  const { client, server } = await connectionPromise.promise

  await expect.poll(() => protocol.handshakeContexts).toHaveLength(1)
  await expect.poll(() => protocol.encodeContexts).toHaveLength(1)
  await expect.poll(() => protocol.decodeContexts).toHaveLength(1)

  const [handshakeContext] = protocol.handshakeContexts
  expect.soft(handshakeContext.client).toBe(client)
  expect.soft(handshakeContext.server).toBe(server)
  expect.soft(handshakeContext.info).toEqual({ protocols: ['chat'] })

  const [encodeContext] = protocol.encodeContexts
  expect.soft(encodeContext.connection).toBe(client)
  expect.soft(encodeContext.client).toBe(client)
  expect.soft(encodeContext.server).toBe(server)
  expect.soft(encodeContext.info).toEqual({ protocols: ['chat'] })

  const [decodeContext] = protocol.decodeContexts
  expect.soft(decodeContext.connection).toBe(client)
  expect.soft(decodeContext.info).toEqual({ protocols: ['chat'] })
})
