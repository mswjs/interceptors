// @vitest-environment node
import net from 'node:net'
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

/**
 * Reply once both small writes of an exchange arrive. With Nagle's
 * algorithm on, the second write waits for the delayed ACK of the
 * first one, stalling the exchange by roughly 40ms.
 */
function createExchangeServer(): net.Server {
  return new net.Server((socket) => {
    const exchange = { receivedBytes: 0 }

    socket.on('data', (chunk) => {
      exchange.receivedBytes += chunk.length

      if (exchange.receivedBytes >= 2) {
        exchange.receivedBytes = 0
        socket.write('k')
      }
    })
  })
}

it('respects "setNoDelay()" on a passthrough socket', async () => {
  await using server = await createRawTestServer(createExchangeServer)

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  socket.setNoDelay(true)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  /**
   * @note Measure several exchanges so a single slow reply (e.g. a
   * scheduling hiccup) cannot fail the test. With Nagle's algorithm
   * on, the stalls add up to ~400ms; with it off, to a few ms.
   */
  const startedAt = performance.now()

  for (let i = 0; i < 10; i++) {
    const replied = Promise.withResolvers<void>()
    socket.once('data', () => replied.resolve())
    socket.write('a')
    socket.write('b')
    await replied.promise
  }

  expect(performance.now() - startedAt).toBeLessThan(100)

  socket.destroy()
})
