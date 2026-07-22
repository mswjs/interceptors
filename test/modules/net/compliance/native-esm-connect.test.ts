// @vitest-environment node
import { createRequire } from 'node:module'
import type net from 'node:net'
import type tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'

interface NativeEsmConnectFixture {
  connectTcp: (port: number, host: string) => net.Socket
  connectTls: (options: tls.ConnectionOptions) => tls.TLSSocket
}

/**
 * @note Load the fixture through Node.js itself ("require(esm)"),
 * not through the test runner. The runner transforms regular imports
 * and resolves Node.js builtins to the live module objects, hiding
 * the ESM binding snapshot problem this test exists to catch. Loaded
 * natively, the fixture links against "node:net"/"node:tls" the way
 * any native ESM consumer does (e.g. "https-proxy-agent" v9+).
 */
function loadFixture(): NativeEsmConnectFixture {
  const require = createRequire(import.meta.url)
  return require('./fixtures/native-esm-connect.mjs')
}

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

it('intercepts a TCP connection made via native ESM bindings', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const fixture = loadFixture()
  const socket = fixture.connectTcp(80, 'non-existing.example')
  const connectListener = vi.fn()
  socket.on('connect', connectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect(errorListener).not.toHaveBeenCalled()

  socket.destroy()
})

it('intercepts a TLS connection made via native ESM bindings', async () => {
  const connectionListener = vi.fn()

  interceptor.on('connection', ({ connectionOptions, controller }) => {
    connectionListener(connectionOptions)
    controller.claim()
  })

  const fixture = loadFixture()
  const socket = fixture.connectTls({
    port: 443,
    host: 'non-existing.example',
    servername: 'non-existing.example',
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()
  expect(errorListener).not.toHaveBeenCalled()
  expect(connectionListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      port: 443,
      host: 'non-existing.example',
      servername: 'non-existing.example',
    })
  )

  socket.destroy()
})
