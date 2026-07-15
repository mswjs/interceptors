// @vitest-environment node
import net from 'node:net'
import crypto from 'node:crypto'
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

it('returns false from "write()" once the buffer exceeds the high water mark', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect(socket.write(Buffer.alloc(4 * 1024 * 1024))).toBe(false)

  await expect.poll(() => listeners.drain).toHaveBeenCalledOnce()

  // Once drained, small writes fit into the buffer again.
  expect(socket.write('hello')).toBe(true)

  socket.destroy()
})

it('delivers a large response intact across "pause()" and "resume()"', async () => {
  const expectedResponse = crypto.randomBytes(4 * 1024 * 1024)

  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end(expectedResponse)
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<Buffer> = []

  socket.on('data', (chunk) => {
    receivedChunks.push(chunk)

    // Pause reading on the first received chunk,
    // then resume shortly after.
    if (receivedChunks.length === 1) {
      socket.pause()
      setTimeout(() => {
        socket.resume()
      }, 100)
    }
  })

  await expect.poll(() => listeners.end, { timeout: 4000 }).toHaveBeenCalledOnce()

  const receivedResponse = Buffer.concat(receivedChunks)
  expect.soft(receivedResponse.byteLength).toBe(expectedResponse.byteLength)
  expect(receivedResponse.equals(expectedResponse)).toBe(true)
})
