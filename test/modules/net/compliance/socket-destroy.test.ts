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

it('drops the connection on "destroy()" mid-transfer', async () => {
  const serverCloseListener = vi.fn()

  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
      socket.on('error', () => {})
      socket.on('close', serverCloseListener)

      // Keep streaming data to the client.
      const pushInterval = setInterval(() => {
        socket.write(Buffer.alloc(65536))
      }, 5)
      socket.on('close', () => {
        clearInterval(pushInterval)
      })
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.data).toHaveBeenCalled()

  socket.destroy()

  // The server must observe the connection being dropped.
  await expect.poll(() => serverCloseListener).toHaveBeenCalledOnce()
  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
})

it('emits no events after "destroy()"', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
      socket.on('error', () => {})

      // Keep streaming data to the client.
      const pushInterval = setInterval(() => {
        socket.write(Buffer.alloc(65536))
      }, 5)
      socket.on('close', () => {
        clearInterval(pushInterval)
      })
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.data).toHaveBeenCalled()

  socket.destroy()

  const eventsAfterDestroy: Array<string> = []
  for (const eventName of ['data', 'end', 'error', 'ready', 'connect']) {
    socket.on(eventName, () => {
      eventsAfterDestroy.push(eventName)
    })
  }

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })

  expect(eventsAfterDestroy).toEqual([])
})
