// @vitest-environment node
import tls from 'node:tls'
import { text } from 'node:stream/consumers'
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

it('writes to a passthrough socket before the tls handshake completes', async () => {
  const serverData = Promise.withResolvers<string>()

  await using server = await createRawTestServer(() => {
    return new tls.Server(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (socket) => {
        serverData.resolve(text(socket))
      }
    )
  })

  interceptor.on('connection', ({ controller }) => {
    controller.passthrough()
  })

  const socket = tls.connect({
    host: server.hostname,
    port: server.port,
    rejectUnauthorized: false,
  })

  socket.write('one;')
  socket.once('connect', () => {
    socket.end('two;')
  })

  await expect(serverData.promise).resolves.toBe('one;two;')
})
