// @vitest-environment node
import { once } from 'node:events'
import net from 'node:net'
import tls from 'node:tls'
import { setImmediate } from 'node:timers/promises'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer, spyOnSocket } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from './fixtures/tls'

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

it('delivers writes issued after the server ends a half-open connection', async () => {
  const serverReceivedChunks: Array<Buffer> = []
  const serverEndListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return new net.Server({ allowHalfOpen: true }, (socket) => {
      socket.on('data', (chunk) => {
        serverReceivedChunks.push(chunk)
      })
      socket.on('end', () => {
        serverEndListener()
        socket.end()
      })

      // End the server-to-client direction immediately.
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

  // The client can still write after receiving FIN from the server.
  socket.write('after-fin')
  socket.end('final')

  await expect.poll(() => serverEndListener).toHaveBeenCalledOnce()
  expect(Buffer.concat(serverReceivedChunks).toString()).toBe('after-finfinal')
})

it('closes the connection once the half-open client ends', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server({ allowHalfOpen: true }, (socket) => {
      socket.resume()
      socket.on('end', () => {
        socket.end()
      })

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

  socket.end()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(listeners.close).toHaveBeenCalledWith(false)
})

it('ends the socket automatically without "allowHalfOpen"', async () => {
  const serverEndListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
      socket.on('end', serverEndListener)
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  // Without "allowHalfOpen", the client automatically sends FIN
  // back once the server ends the connection.
  await expect.poll(() => serverEndListener).toHaveBeenCalledOnce()
  expect(listeners.close).toHaveBeenCalledWith(false)
})

/**
 * @see https://github.com/mswjs/interceptors/issues/821
 */
it('delivers TCP writes while the server response remains unread', async () => {
  const receivedData = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new net.Server({ allowHalfOpen: true }, (socket) => {
      socket.on('data', (chunk) => {
        receivedData.resolve(chunk.toString())
      })
      socket.end('response')
    })
  })
  const serverEnded = Promise.withResolvers<void>()

  interceptor.on('connection', ({ controller }) => {
    const realSocket = controller.passthrough()
    realSocket.once('end', serverEnded.resolve)
  })

  const socket = net.connect({
    host: server.hostname,
    port: server.port,
  })
  onTestFinished(() => {
    socket.destroy()
  })
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await serverEnded.promise

  // Process the server ending while the client keeps its response buffered.
  await setImmediate()
  await setImmediate()

  expect.soft(socket.readableEnded).toBe(false)
  expect(socket.writable).toBe(true)

  const writeCompleted = Promise.withResolvers<void>()

  expect(() => {
    socket.write(Buffer.from('remaining data'), (error) => {
      if (error) {
        writeCompleted.reject(error)
      } else {
        writeCompleted.resolve()
      }
    })
  }).not.toThrow()

  await expect(writeCompleted.promise).resolves.toBeUndefined()
  await expect(receivedData.promise).resolves.toBe('remaining data')
  expect(socket.read()).toEqual(Buffer.from('response'))

  const closed = once(socket, 'close')
  socket.resume()
  await closed
  expect(errorListener).not.toHaveBeenCalled()
})

it('delivers TLS writes while the server response remains unread', async () => {
  const receivedData = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new tls.Server(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY, allowHalfOpen: true },
      (socket) => {
        socket.on('data', (chunk) => {
          receivedData.resolve(chunk.toString())
        })
        socket.end('response')
      }
    )
  })
  const serverEnded = Promise.withResolvers<void>()

  interceptor.on('connection', ({ controller }) => {
    const realSocket = controller.passthrough()
    realSocket.once('end', serverEnded.resolve)
  })

  const socket = tls.connect({
    host: server.hostname,
    port: server.port,
    ca: TLS_CERTIFICATE,
  })
  onTestFinished(() => {
    socket.destroy()
  })
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await serverEnded.promise

  // Process the server ending while the client keeps its response buffered.
  await setImmediate()
  await setImmediate()

  expect.soft(socket.readableEnded).toBe(false)
  expect(socket.writable).toBe(true)

  const writeCompleted = Promise.withResolvers<void>()

  expect(() => {
    socket.write(Buffer.from('remaining data'), (error) => {
      if (error) {
        writeCompleted.reject(error)
      } else {
        writeCompleted.resolve()
      }
    })
  }).not.toThrow()

  await expect(writeCompleted.promise).resolves.toBeUndefined()
  await expect(receivedData.promise).resolves.toBe('remaining data')
  expect(socket.read()).toEqual(Buffer.from('response'))

  const closed = once(socket, 'close')
  socket.resume()
  await closed
  expect(errorListener).not.toHaveBeenCalled()
})
