// @vitest-environment node
import net from 'node:net'
import { invariant } from 'outvariant'
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

it('exposes empty address information before connecting', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)

  expect.soft(socket.remoteAddress).toBeUndefined()
  expect.soft(socket.remotePort).toBeUndefined()
  expect.soft(socket.remoteFamily).toBeUndefined()
  expect.soft(socket.localAddress).toBeUndefined()
  expect.soft(socket.localPort).toBeUndefined()
  expect(socket.address()).toEqual({})

  socket.destroy()
})

it('exposes address information after connecting', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(server.port)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: socket.localPort,
  })

  socket.destroy()
})

it('exposes address information for a mocked connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = net.connect(1337, '127.0.0.1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(1337)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: socket.localPort,
  })

  socket.destroy()
})

it('exposes address information for a mocked IPv6 connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = net.connect(1337, '::1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('::1')
  expect.soft(socket.remotePort).toBe(1337)
  expect.soft(socket.remoteFamily).toBe('IPv6')
  expect.soft(socket.localAddress).toBe('::1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '::1',
    family: 'IPv6',
    port: socket.localPort,
  })

  socket.destroy()
})

it('exposes IPv6 address information for a mocked connection with the "family" option', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  // The hostname alone does not describe the IP family.
  // The "family" option must trigger the IPv6 address info.
  const socket = net.connect({
    port: 1337,
    host: 'example.test',
    family: 6,
  })
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('::1')
  expect.soft(socket.remotePort).toBe(1337)
  expect.soft(socket.remoteFamily).toBe('IPv6')
  expect.soft(socket.localAddress).toBe('::1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
  expect(socket.address()).toEqual({
    address: '::1',
    family: 'IPv6',
    port: socket.localPort,
  })

  socket.destroy()
})

it('respects the "localAddress" and "localPort" options for a mocked connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = net.connect({
    port: 1337,
    host: '127.0.0.1',
    localAddress: '127.0.0.1',
    localPort: 56789,
  })
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toBe(56789)
  expect(socket.address()).toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: 56789,
  })

  socket.destroy()
})

it('keeps the remote address information after the mocked connection is destroyed', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = net.connect(1337, '127.0.0.1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  /**
   * @note Read the remote address info while connected so it gets
   * cached on the socket. Node.js only keeps the cached values after
   * the socket is destroyed; unread values become undefined.
   */
  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(1337)
  expect.soft(socket.remoteFamily).toBe('IPv4')

  socket.destroy()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(1337)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localPort).toBeUndefined()
  expect(socket.address()).toEqual({})
})

it('exposes address information after connecting over IPv6', async () => {
  const server = new net.Server(() => {})

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '::1', () => {
      resolve()
    })
    server.once('error', reject)
  })

  const serverAddress = server.address()
  invariant(
    serverAddress != null && typeof serverAddress === 'object',
    'Failed to retrieve the test server address'
  )

  try {
    const socket = net.connect({
      port: serverAddress.port,
      host: '::1',
      family: 6,
    })
    const { listeners } = spyOnSocket(socket)

    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

    expect.soft(socket.remoteAddress).toBe('::1')
    expect.soft(socket.remotePort).toBe(serverAddress.port)
    expect.soft(socket.remoteFamily).toBe('IPv6')
    expect.soft(socket.localAddress).toBe('::1')
    expect(socket.address()).toEqual({
      address: '::1',
      family: 'IPv6',
      port: socket.localPort,
    })

    socket.destroy()
  } finally {
    server.close()
  }
})

it('respects the "localPort" connection option', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  // Open a server to obtain a free port, then close it
  // so that port can be used as the local port below.
  const portServer = await createTestServer(() => {
    return new net.Server()
  })
  const freeLocalPort = portServer.port
  await portServer[Symbol.asyncDispose]()

  const socket = net.connect({
    port: server.port,
    host: server.hostname,
    localPort: freeLocalPort,
  })
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.localPort).toBe(freeLocalPort)
  expect(socket.localAddress).toBe('127.0.0.1')

  socket.destroy()
})

it('keeps the remote address information after the connection is destroyed', async () => {
  await using server = await createTestServer(() => {
    return new net.Server(() => {})
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  /**
   * @note Read the remote address info while connected so it gets
   * cached on the socket. Node.js only keeps the cached values after
   * the socket is destroyed; unread values become undefined.
   */
  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(server.port)
  expect.soft(socket.remoteFamily).toBe('IPv4')

  socket.destroy()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(server.port)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localPort).toBeUndefined()
  expect(socket.address()).toEqual({})
})
