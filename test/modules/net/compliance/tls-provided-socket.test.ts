// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer } from '#/test/helpers'
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

it('intercepts a TLS connection over a caller-provided socket', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const transportSocket = net.connect(443, 'non-existing.example')
  const socket = tls.connect({
    socket: transportSocket,
    servername: 'non-existing.example',
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()
  expect(errorListener).not.toHaveBeenCalled()
  expect(connectionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      servername: 'non-existing.example',
    })
  )

  socket.destroy()
})

it('passes through a TLS connection over a caller-provided socket', async () => {
  await using server = await createRawTestServer(() => {
    return new tls.Server(
      {
        cert: TLS_CERTIFICATE,
        key: TLS_PRIVATE_KEY,
      },
      (connection) => connection.pipe(connection)
    )
  })

  interceptor.on('connection', ({ controller }) => {
    controller.passthrough()
  })

  const transportSocket = net.connect(server.port, server.hostname)
  const socket = tls.connect({
    socket: transportSocket,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const dataListener = vi.fn<(chunk: string) => void>()
  socket.on('data', (chunk) => dataListener(chunk.toString()))

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()
  expect(socket.authorized).toBe(true)

  socket.write('hello')

  await expect.poll(() => dataListener).toHaveBeenCalledExactlyOnceWith('hello')
  expect(errorListener).not.toHaveBeenCalled()

  socket.destroy()
})

it('dials the target with the caller\'s "lookup" when passing through TLS layered over a pending transport', async () => {
  await using server = await createRawTestServer(() => {
    return new tls.Server(
      {
        cert: TLS_CERTIFICATE,
        key: TLS_PRIVATE_KEY,
      },
      (connection) => connection.pipe(connection)
    )
  })

  /**
   * @note The transport carries no data of its own (the TLS layer
   * does) and gets no verdict. The passed-through TLS layer then
   * dials the transport's target directly, which must happen with
   * the caller's connection options, including their "lookup".
   */
  interceptor.on('connection', ({ socket, controller }) => {
    if (socket instanceof tls.TLSSocket) {
      controller.passthrough()
    }
  })

  const lookup = vi.fn<net.LookupFunction>((hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: server.hostname, family: 4 }])
      return
    }

    callback(null, server.hostname, 4)
  })
  const transportSocket = net.connect({
    host: 'db.internal',
    port: server.port,
    lookup,
  })
  const socket = tls.connect({
    socket: transportSocket,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const dataListener = vi.fn<(chunk: string) => void>()
  socket.on('data', (chunk) => dataListener(chunk.toString()))

  socket.once('secureConnect', () => {
    socket.write('hello')
  })

  await expect.poll(() => dataListener).toHaveBeenCalledExactlyOnceWith('hello')
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect(lookup).toHaveBeenCalledWith(
    'db.internal',
    expect.anything(),
    expect.any(Function)
  )

  socket.destroy()
})

it('intercepts a connection made from a listener of a passed-through layered TLS socket', async () => {
  await using server = await createRawTestServer(() => {
    return new tls.Server(
      {
        cert: TLS_CERTIFICATE,
        key: TLS_PRIVATE_KEY,
      },
      (connection) => connection.pipe(connection)
    )
  })

  const connectionListener = vi.fn<(host: string | null | undefined) => void>()
  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions.host)

    // Only a mocked connection to this host can ever connect.
    if (connectionOptions.host === 'nested.example') {
      controller.claim()
      return
    }

    controller.passthrough()
  })

  const transportSocket = net.connect(server.port, server.hostname)
  const socket = tls.connect({
    socket: transportSocket,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  /**
   * @note The real connection's events run in the async context it was
   * established in. A connection the client makes from there is the
   * client's own and must be intercepted like any other.
   */
  const nestedConnectionPromise = new Promise<net.Socket>((resolve, reject) => {
    socket.once('data', () => {
      const nestedSocket = net.connect(server.port, 'nested.example')
      nestedSocket.once('connect', () => resolve(nestedSocket))
      nestedSocket.once('error', reject)
    })
  })

  socket.once('secureConnect', () => {
    socket.write('hello')
  })

  const nestedSocket = await nestedConnectionPromise
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect(connectionListener.mock.calls).toEqual([
    [server.hostname],
    [server.hostname],
    ['nested.example'],
  ])

  nestedSocket.destroy()
  socket.destroy()
})
