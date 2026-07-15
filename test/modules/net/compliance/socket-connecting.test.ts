// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer, spyOnSocket } from '#/test/helpers'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('reports an opening socket while connecting', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)

  expect.soft(socket.connecting).toBe(true)
  expect.soft(socket.pending).toBe(true)
  expect(socket.readyState).toBe('opening')

  socket.destroy()
})

it('reports an open socket after connecting', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.pending).toBe(false)
  expect(socket.readyState).toBe('open')

  socket.destroy()
})

it('reports a write-only socket after the server ends a half-open connection', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect({
    port: server.port,
    host: server.hostname,
    allowHalfOpen: true,
  })
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.end).toHaveBeenCalledOnce()

  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.pending).toBe(false)
  expect(socket.readyState).toBe('writeOnly')

  socket.destroy()
})

it('reports a read-only socket after the client ends the connection', async () => {
  await using server = await createTestServer(() => {
    return new net.Server({ allowHalfOpen: true }, (socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const finishListener = vi.fn()
  socket.on('finish', finishListener)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.end('bye')

  await expect.poll(() => finishListener).toHaveBeenCalledOnce()

  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.pending).toBe(false)
  expect(socket.readyState).toBe('readOnly')

  socket.destroy()
})

it('reports a closed socket after the connection closes', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.pending).toBe(true)
  expect(socket.readyState).toBe('closed')
})

it('reports a closed socket for a refused connection', async () => {
  // Open a server to obtain a port, then close it
  // so connecting to that port is guaranteed to be refused.
  const closedServer = await createTestServer(() => {
    return new net.Server()
  })
  const refusedPort = closedServer.port
  await closedServer[Symbol.asyncDispose]()

  const socket = net.connect(refusedPort, '127.0.0.1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.pending).toBe(true)
  expect(socket.readyState).toBe('closed')
})
