// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from '../compliance/fixtures/tls'

it('does not intercept the passthrough connection of a disposed interceptor', async () => {
  const serverReceivedData = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new tls.Server(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (socket) => {
        socket.on('data', (chunk) => {
          serverReceivedData.resolve(chunk.toString('utf8'))
          socket.end('pong')
        })
      }
    )
  })

  const firstInterceptor = new SocketInterceptor()
  firstInterceptor.apply()
  onTestFinished(() => firstInterceptor.dispose())

  const pendingVerdict = Promise.withResolvers<() => void>()
  firstInterceptor.on('connection', ({ controller }) => {
    pendingVerdict.resolve(() => controller.passthrough())
  })

  const socket = tls.connect({
    host: 'localhost',
    port: server.port,
    ca: [TLS_CERTIFICATE],
  })
  onTestFinished(() => {
    socket.destroy()
  })
  const clientReceivedData = Promise.withResolvers<string>()
  socket.on('data', (chunk) => clientReceivedData.resolve(chunk.toString()))
  socket.write('ping')

  const passthrough = await pendingVerdict.promise

  /**
   * @note The connection is in flight when its interceptor is
   * disposed and another one applied (e.g. a request outliving its
   * test file). The passthrough connection it establishes afterwards
   * is an internal one and must not be intercepted by the other.
   */
  firstInterceptor.dispose()
  const secondInterceptor = new SocketInterceptor()
  secondInterceptor.apply()
  onTestFinished(() => secondInterceptor.dispose())
  const secondConnectionListener = vi.fn(({ controller }) => {
    controller.passthrough()
  })
  secondInterceptor.on('connection', secondConnectionListener)

  passthrough()

  await expect(serverReceivedData.promise).resolves.toBe('ping')
  await expect(clientReceivedData.promise).resolves.toBe('pong')
  expect(secondConnectionListener).not.toHaveBeenCalled()
})
