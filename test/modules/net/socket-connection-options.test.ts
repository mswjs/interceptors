// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'

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

it('exposes the known options for "net.connect(options)"', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const lookupFunction: net.LookupFunction = (hostname, options, callback) => {
    callback(null, '127.0.0.1', 4)
  }

  const socket = net.connect({
    port: 1337,
    host: '127.0.0.1',
    family: 4,
    hints: 0,
    localAddress: '127.0.0.1',
    localPort: 56790,
    timeout: 10_000,
    lookup: lookupFunction,
    allowHalfOpen: true,
    noDelay: true,
    keepAlive: true,
    keepAliveInitialDelay: 100,
    autoSelectFamily: false,
    autoSelectFamilyAttemptTimeout: 250,
  })

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()
  expect(connectionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      port: 1337,
      host: '127.0.0.1',
      family: 4,
      hints: 0,
      localAddress: '127.0.0.1',
      localPort: 56790,
      timeout: 10_000,
      lookup: lookupFunction,
      allowHalfOpen: true,
      noDelay: true,
      keepAlive: true,
      keepAliveInitialDelay: 100,
      autoSelectFamily: false,
      autoSelectFamilyAttemptTimeout: 250,
    })
  )

  socket.destroy()
})

it('exposes the connection options for "net.connect(port, host)"', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const socket = net.connect(1337, '127.0.0.1')

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()
  expect(connectionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      port: 1337,
      host: '127.0.0.1',
    })
  )

  socket.destroy()
})

it('exposes the known options for an IPC connection', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const socket = net.connect({
    path: '/tmp/test.sock',
    timeout: 10_000,
    allowHalfOpen: true,
  })

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()
  expect(connectionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/tmp/test.sock',
      timeout: 10_000,
      allowHalfOpen: true,
    })
  )

  socket.destroy()
})

it('ignores unknown options', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const connectOptions = {
    port: 1337,
    host: '127.0.0.1',
    unknownOption: 'ignored',
  }
  const socket = net.connect(connectOptions)

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()

  const [exposedConnectionOptions] = connectionListener.mock.calls[0]
  expect.soft(exposedConnectionOptions).toEqual(
    expect.objectContaining({
      port: 1337,
      host: '127.0.0.1',
    })
  )
  expect(exposedConnectionOptions).not.toHaveProperty('unknownOption')

  socket.destroy()
})

it('exposes the known options for "tls.connect(options)"', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const connectionOptions: tls.ConnectionOptions & net.TcpNetConnectOpts = {
    port: 1337,
    host: '127.0.0.1',
    servername: 'example.com',
    ALPNProtocols: ['h2', 'http/1.1'],
    rejectUnauthorized: false,
    allowHalfOpen: true,
    noDelay: true,
  }
  const socket = tls.connect(connectionOptions)

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()
  expect(connectionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      port: 1337,
      host: '127.0.0.1',
      servername: 'example.com',
      ALPNProtocols: ['h2', 'http/1.1'],
      rejectUnauthorized: false,
      allowHalfOpen: true,
      noDelay: true,
    })
  )

  socket.destroy()
})
