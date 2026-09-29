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
