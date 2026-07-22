/**
 * @vitest-environment node
 * @note This test is intentionally omitted in the main test run.
 * It's meant to be spawned in a child process by the actual test
 * because the regression it reproduces crashes the Node.js process
 * with a native, uncatchable "Assertion failed: !current_write_"
 * abort in "TLSWrap::DoWrite" ("crypto_tls.cc").
 *
 * The crash: flushing multiple buffered writes to the real
 * passthrough TLS socket via direct "_writeGeneric" calls bypasses
 * the Writable queue. While the real socket is still connecting,
 * each such call defers itself to the "connect" event, and on
 * connect they replay back-to-back, issuing concurrent writes on
 * the TLSWrap handle that only supports one write in flight.
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import net from 'node:net'
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from '../compliance/fixtures/tls'

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
 * Delays the connection of a socket by the given time.
 * A server cannot delay an inbound TCP connection (the kernel
 * completes the handshake before "accept"), so the connection
 * delay is emulated on the client via a slow "lookup". The real
 * passthrough socket inherits it, staying in the "connecting"
 * state while the buffered writes are flushed to it (the same
 * window a slow external connect opens).
 */
function createDelayedLookup(delayMs: number): net.LookupFunction {
  return (hostname, options, callback) => {
    setTimeout(() => {
      if (options.all) {
        callback(null, [{ address: '127.0.0.1', family: 4 }])
        return
      }

      callback(null, '127.0.0.1', 4)
    }, delayMs)
  }
}

it('flushes multiple buffered writes to a connecting passthrough tls socket', async () => {
  const serverReceivedData = Promise.withResolvers<string>()

  await using server = await createTestServer(() => {
    return new tls.Server(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (socket) => {
        const chunks: Array<Buffer> = []
        socket.on('data', (chunk) => {
          chunks.push(chunk)
          const data = Buffer.concat(chunks).toString('utf8')

          if (data === 'chunk-onechunk-two') {
            serverReceivedData.resolve(data)
          }
        })
      }
    )
  })

  // Delay the passthrough decision so the client writes below
  // accumulate as separate buffered writes on the socket controller.
  interceptor.on('connection', async ({ controller }) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })

    controller.passthrough()
  })

  const socket = tls.connect({
    host: 'localhost',
    port: server.port,
    rejectUnauthorized: false,
    lookup: createDelayedLookup(100),
  })

  socket.once('secureConnect', () => {
    socket.write('chunk-one')

    // Write the second chunk in a separate tick so it becomes
    // a separate pending write instead of joining the first one.
    setTimeout(() => {
      socket.write('chunk-two')
    }, 10)
  })

  await expect(serverReceivedData.promise).resolves.toBe('chunk-onechunk-two')

  socket.destroy()
})
