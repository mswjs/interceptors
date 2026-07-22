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

it('intercepts a connection made via "net.connect()"', async () => {
  const connectionListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.passthrough()
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect(connectionListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      port: server.port,
      host: server.hostname,
    })
  )
})

it('invokes the connection callback exactly once for a deferred claim', async () => {
  interceptor.on('connection', async ({ socket, controller }) => {
    // Claim the connection asynchronously, like request
    // handlers that await their own logic before responding.
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    controller.claim()
    socket.end()
  })

  const connectingStatesAtCallback: Array<boolean> = []
  const connectionCallback = vi.fn(() => {
    connectingStatesAtCallback.push(socket.connecting)
  })

  const socket = net.connect(80, 'any.host.com', connectionCallback)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(connectionCallback).toHaveBeenCalledOnce()
  // The socket must report itself as connected in the "connect" listener.
  expect(connectingStatesAtCallback).toEqual([false])
})

it('mocks a connection made via "net.connect()"', async () => {
  interceptor.on('connection', ({ socket, controller }) => {
    controller.claim()

    socket.on('data', (chunk) => {
      if (chunk.toString() === 'hello from client') {
        socket.write('hello from server')
        socket.end()
      }
    })
  })

  const socket = net.connect(80, 'any.host.com')
  const { listeners, events } = spyOnSocket(socket)

  socket.write('hello from client')

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect(events).toEqual([
    ['lookup', null, '127.0.0.1', 4, 'any.host.com'],
    ['connectionAttempt', '127.0.0.1', 80, 4],
    ['connect'],
    ['ready'],
    ['data', Buffer.from('hello from server')],
    ['end'],
    ['close', false],
  ])
})
