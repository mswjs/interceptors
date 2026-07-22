// @vitest-environment node
import net from 'node:net'
import tls from 'node:tls'
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

it('fails the handshake against a non-TLS server', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.write('hello world\n')
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
  })
  const { listeners } = spyOnSocket(socket)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()

  const [handshakeError] = listeners.error.mock.calls[0]
  expect.soft(handshakeError).toBeInstanceOf(Error)
  /**
   * @note The exact SSL error differs between the OpenSSL versions:
   * Node.js 22 reports "packet length too long" while Node.js 24
   * reports "wrong version number" for the same non-TLS response.
   */
  expect.soft([
    'ERR_SSL_PACKET_LENGTH_TOO_LONG',
    'ERR_SSL_WRONG_VERSION_NUMBER',
  ]).toContain(handshakeError.code)
  expect(['packet length too long', 'wrong version number']).toContain(
    handshakeError.reason
  )

  expect(secureConnectListener).not.toHaveBeenCalled()
})
