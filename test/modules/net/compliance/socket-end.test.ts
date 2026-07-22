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

it('sends the final chunk passed to "end()"', async () => {
  const serverReceivedChunks: Array<Buffer> = []
  const serverEndListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', (chunk) => {
        serverReceivedChunks.push(chunk)
      })
      socket.on('end', serverEndListener)
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.write('hello ')
  socket.end('world')

  await expect.poll(() => serverEndListener).toHaveBeenCalledOnce()
  expect(Buffer.concat(serverReceivedChunks).toString()).toBe('hello world')
})

it('sends FIN to the server on "end()"', async () => {
  const serverEndListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
      socket.on('end', serverEndListener)
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.end()

  await expect.poll(() => serverEndListener).toHaveBeenCalledOnce()
})

it('invokes the "end()" callback once the socket finishes', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const endCallback = vi.fn()
  const finishListener = vi.fn()
  socket.on('finish', finishListener)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.end('bye', endCallback)

  await expect.poll(() => finishListener).toHaveBeenCalledOnce()
  expect(endCallback).toHaveBeenCalledOnce()
})

it('emits an error when writing after "end()"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.end('bye')

  expect(socket.write('after-end')).toBe(false)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()
  expect(listeners.error).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'ERR_STREAM_WRITE_AFTER_END' })
  )

  socket.destroy()
})
