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

it('emits correct events for a passthrough connection', async () => {
  const serverConnectionListener = vi.fn()
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      serverConnectionListener(socket)
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  socket.resume()

  expect(socket.connecting).toBe(true)

  await expect.poll(() => listeners.connect).toHaveBeenCalledOnce()
  expect.soft(socket.connecting).toBe(false)
  expect
    .soft(events)
    .toEqual([
      ['connectionAttempt', server.hostname, server.port, 4],
      ['connect'],
      ['ready'],
      ['end'],
      ['close', false],
    ])

  expect(socket.connecting).toBe(false)
})

it('emits the "lookup" event when connecting to a hostname', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect({
    port: server.port,
    host: 'localhost',
    family: 4,
  })
  const { listeners, events } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['lookup', null, '127.0.0.1', 4, 'localhost'],
    ['connectionAttempt', '127.0.0.1', server.port, 4],
    ['connect'],
    ['ready'],
    ['end'],
    ['close', false],
  ])
})

it('emits correct events for a refused connection', async () => {
  // Open a server to obtain a port, then close it
  // so connecting to that port is guaranteed to be refused.
  const closedServer = await createTestServer(() => {
    return new net.Server()
  })
  const refusedPort = closedServer.port
  await closedServer[Symbol.asyncDispose]()

  const socket = net.connect(refusedPort, '127.0.0.1')
  const { listeners, events } = spyOnSocket(socket)

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  const connectionError = expect.objectContaining({
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '127.0.0.1',
    port: refusedPort,
  })

  expect.soft(events).toEqual([
    ['connectionAttempt', '127.0.0.1', refusedPort, 4],
    ['connectionAttemptFailed', '127.0.0.1', refusedPort, 4, connectionError],
    ['error', connectionError],
    ['close', true],
  ])

  // The failed connection must never report the socket as connected.
  expect.soft(listeners.connect).not.toHaveBeenCalled()
  expect.soft(listeners.error).toHaveBeenCalledOnce()
  expect(listeners.close).toHaveBeenCalledOnce()
})

it('emits events in the correct order when the client ends the connection', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
      socket.on('end', () => {
        socket.end()
      })
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners, events } = spyOnSocket(socket)

  // Spy on the "finish" event manually since it's not a part
  // of the standard socket event spy list.
  socket.on('finish', () => {
    events.push(['finish'])
  })

  socket.resume()
  socket.once('ready', () => {
    socket.write('hello')
    socket.end()
  })

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(events).toEqual([
    ['connectionAttempt', server.hostname, server.port, 4],
    ['connect'],
    ['ready'],
    ['finish'],
    ['end'],
    ['close', false],
  ])
})

it('emits "timeout" on an idle socket without destroying it', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.setTimeout(200)

  await expect.poll(() => listeners.timeout).toHaveBeenCalledOnce()

  // Timing out must not destroy the socket (parity with Node.js).
  expect.soft(socket.destroyed).toBe(false)
  expect.soft(listeners.error).not.toHaveBeenCalled()
  expect(listeners.close).not.toHaveBeenCalled()

  socket.destroy()
})

it('emits "drain" after a write that exceeded the write buffer', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.resume()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  // Writing past the high water mark must communicate backpressure.
  expect(socket.write(Buffer.alloc(4 * 1024 * 1024))).toBe(false)

  await expect.poll(() => listeners.drain).toHaveBeenCalledOnce()

  socket.destroy()
})

/**
 * @note Currently, the connection callback is invoked twice:
 * once via the emulated "connect" and once via the real socket
 * "connect" event forwarding.
 */
it.fails('invokes the connection callback exactly once', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.connect(server.port, server.hostname, connectionCallback)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
  expect(listeners.connect).toHaveBeenCalledOnce()
})
