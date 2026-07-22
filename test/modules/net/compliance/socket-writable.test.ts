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

it('reports a writable socket before connecting', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)

  expect.soft(socket.writable).toBe(true)
  expect.soft(socket.writableEnded).toBe(false)
  expect(socket.writableFinished).toBe(false)

  socket.destroy()
})

it('marks the socket as non-writable after "end()"', async () => {
  await using server = await createRawTestServer(() => {
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

  expect.soft(socket.writable).toBe(false)
  expect.soft(socket.writableEnded).toBe(true)
  expect.soft(socket.writableFinished).toBe(true)
  expect(socket.readable).toBe(true)

  socket.destroy()
})

it('keeps the socket writable after the server ends a half-open connection', async () => {
  await using server = await createRawTestServer(() => {
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

  expect.soft(socket.writable).toBe(true)
  expect(socket.writableEnded).toBe(false)

  socket.destroy()
})

it('counts "bytesWritten" for writes issued while connecting', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)

  socket.write('hello')

  expect(socket.bytesWritten).toBe(5)

  socket.destroy()
})

it('counts "bytesWritten" across multiple writes and encodings', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const finishListener = vi.fn()
  socket.on('finish', finishListener)

  socket.write('hello')

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.write(Buffer.from('world'))
  // Writes "hi" (2 bytes).
  socket.write('aGk=', 'base64')

  expect.soft(socket.bytesWritten).toBe(12)

  socket.end('bye')

  await expect.poll(() => finishListener).toHaveBeenCalledOnce()

  expect(socket.bytesWritten).toBe(15)

  socket.destroy()
})

it('preserves "bytesWritten" after the connection closes', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.write('hello')
  socket.end()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect(socket.bytesWritten).toBe(5)
})
