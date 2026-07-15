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

it('reports a readable socket before connecting', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)

  expect(socket.readable).toBe(true)

  socket.destroy()
})

it('marks the socket as non-readable after the server ends the connection', async () => {
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

  expect.soft(socket.readable).toBe(false)
  expect(socket.writable).toBe(true)

  socket.destroy()
})

it('keeps the socket readable after the client ends the connection', async () => {
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

  expect.soft(socket.readable).toBe(true)
  expect(socket.writable).toBe(false)

  socket.destroy()
})

it('counts "bytesRead" after reading the server response', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.write('hello world')
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.data).toHaveBeenCalled()

  expect(socket.bytesRead).toBe(11)

  socket.destroy()
})

it('preserves "bytesRead" after the connection closes', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end('hello world')
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect(socket.bytesRead).toBe(11)
})
