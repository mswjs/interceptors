/**
 * @vitest-environment node
 * @note This test is intentionally omitted in the main test run.
 * It's meant to be spawned in a child process by the actual test
 * because the regression it reproduces crashes the Node.js process
 * with a native, uncatchable "Assertion failed: !wrap->started_"
 * abort in "TLSWrap::Start" ("crypto_tls.cc").
 *
 * The crash: a TLS connection in flight when the interceptor is
 * disposed (e.g. a request outliving its test file) passes through
 * afterwards. Its handshake trigger ("_start") is still listening
 * for "connect", and the real connection's "connect" starts the
 * handshake again on the handle that already performed it.
 */
import { it, expect, beforeAll } from 'vitest'
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from '../compliance/fixtures/tls'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

it('passes through a tls socket after the interceptor is disposed', async () => {
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

  const pendingVerdict = Promise.withResolvers<() => void>()
  interceptor.on('connection', ({ controller }) => {
    pendingVerdict.resolve(() => controller.passthrough())
  })

  const socket = tls.connect({
    host: 'localhost',
    port: server.port,
    ca: [TLS_CERTIFICATE],
  })
  const dataListener = Promise.withResolvers<string>()
  socket.on('data', (chunk) => dataListener.resolve(chunk.toString('utf8')))

  // Write before the connection settles so the client awaits no
  // connection notification (nothing is emulated).
  socket.write('ping')

  const passthrough = await pendingVerdict.promise

  // The interceptor is disposed while the connection is in flight.
  interceptor.dispose()
  passthrough()

  await expect(serverReceivedData.promise).resolves.toBe('ping')
  await expect(dataListener.promise).resolves.toBe('pong')

  socket.destroy()
})
