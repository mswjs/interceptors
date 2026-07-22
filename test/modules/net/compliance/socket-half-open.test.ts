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
