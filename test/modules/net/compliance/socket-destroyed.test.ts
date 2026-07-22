// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer, spyOnSocket } from '#/test/helpers'

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

it('destroys the socket after "destroy()" on an open connection', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.destroy()

  expect.soft(socket.destroyed).toBe(true)
  expect.soft(socket.writable).toBe(false)
  expect.soft(socket.readable).toBe(false)
  expect(socket.readyState).toBe('closed')

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.destroyed).toBe(true)
  expect.soft(socket.writable).toBe(false)
  expect(socket.readable).toBe(false)
})

it('destroys the socket after "destroy()" while connecting', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.destroy()

  expect.soft(socket.destroyed).toBe(true)
  expect.soft(socket.writable).toBe(false)
  expect.soft(socket.readable).toBe(false)
  expect(socket.readyState).toBe('closed')

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).not.toHaveBeenCalled()
  expect(listeners.error).not.toHaveBeenCalled()
})

it('destroys the socket after a connection error', async () => {
  // Open a server to obtain a port, then close it
  // so connecting to that port is guaranteed to be refused.
  const closedServer = await createRawTestServer(() => {
    return new net.Server()
  })
  const refusedPort = closedServer.port
  await closedServer[Symbol.asyncDispose]()

  const socket = net.connect(refusedPort, '127.0.0.1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.destroyed).toBe(true)
  expect.soft(socket.writable).toBe(false)
  expect.soft(socket.readable).toBe(false)
  expect(socket.readyState).toBe('closed')
})

it('destroys the socket after the connection closes normally', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.destroyed).toBe(true)
  expect.soft(socket.writable).toBe(false)
  expect(socket.readable).toBe(false)
})
