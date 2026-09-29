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
