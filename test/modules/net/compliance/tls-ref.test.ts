// @vitest-environment node
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

/**
 * Count the TCP socket handles that keep the process alive.
 * Unrefed handles are excluded from the active resources list,
 * making this a proxy for the process exit behavior.
 */
function countActiveTcpSockets(): number {
  return process.getActiveResourcesInfo().filter((resourceName) => {
    return resourceName === 'TCPSocketWrap'
  }).length
}

it('releases all connection handles once a TLS socket is destroyed', async () => {
  await using server = await createRawTestServer(() => {
    const tlsServer = new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })

    // Unref the server-side sockets so only the client-side
    // handles are reflected in the active resources count.
    tlsServer.on('connection', (socket) => {
      socket.unref()
    })

    return tlsServer
  })

  // Wait for the sockets from the previous tests to fully close.
  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  socket.destroy()

  await expect.poll(() => countActiveTcpSockets()).toBe(0)
})
