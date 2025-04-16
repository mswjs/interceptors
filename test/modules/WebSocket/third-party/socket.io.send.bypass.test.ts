// @vitest-environment node
import http from 'node:http'
import { vi, beforeAll, beforeEach, afterAll, it, expect } from 'vitest'
import { io } from 'socket.io-client'
import { Server } from 'socket.io'
import { BatchInterceptor } from '../../../../src'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new BatchInterceptor({
  name: 'test-interceptor',
  interceptors: [new ClientRequestInterceptor(), new WebSocketInterceptor()],
})

const wss = new Server()
const httpServer = new http.Server()

beforeAll(async () => {
  interceptor.apply()
  wss.listen(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
})

beforeEach(() => {
  interceptor.removeAllListeners()
  wss.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  wss.disconnectSockets()
  await wss.close()
})

function getHttpServerHost(server: http.Server): string {
  const address = server.address()
  if (!address) {
    throw new Error('Server is not listening')
  }
  if (typeof address === 'string') {
    return new URL(address).host
  }
  return `localhost:${address.port}`
}

it('bypasses sending text', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.send('hello world')
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith('hello world')
  })
})

it('bypasses sending buffer', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.send(new TextEncoder().encode('hello world'))
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith(Buffer.from('hello world'))
  })
})

it('bypasses emitting event without payload', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('hello', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.emit('hello')
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith(undefined)
  })
})

it('bypasses emitting event with text payload', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('hello', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.emit('hello', 'John')
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith('John')
  })
})

it('bypasses emitting event with buffer payload', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('hello', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.emit('hello', new TextEncoder().encode('John'))
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith(Buffer.from('John'))
  })
})

it('bypasses emitting event with flat object payload', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('hello', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.emit('hello', { name: 'John' })
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith({ name: 'John' })
  })
})

it('bypasses emitting event with deep object payload', async () => {
  const serverReceiver = vi.fn<(data: string) => void>()

  wss.on('connection', (socket) => {
    socket.on('hello', (data) => {
      serverReceiver(data)
    })
  })

  const client = io(`ws://${getHttpServerHost(httpServer)}`, {
    transports: ['websocket'],
  })
  client.once('connect', () => {
    client.emit('hello', {
      name: 'John',
      address: { street: 'Sunwell ave.' },
    })
  })

  await vi.waitFor(() => {
    expect(serverReceiver).toHaveBeenCalledWith({
      name: 'John',
      address: { street: 'Sunwell ave.' },
    })
  })
})
