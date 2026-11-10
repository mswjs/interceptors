// @vitest-environment node
import { once } from 'node:events'
import net from 'node:net'
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createRawTestServer } from '#/test/helpers'

/**
 * @note A connection is handed to the "connection" listeners on the
 * next tick. Disposing the interceptor before that tick must not
 * pass the connection through to the real network: the interceptor
 * owned it, and nothing can handle it anymore.
 */
const interceptor = new SocketInterceptor()

afterEach(() => {
  interceptor.dispose()
})

it('closes a tcp connection pending at the disposal without connecting to the real network', async () => {
  const realConnectionListener = vi.fn()
  await using server = await createRawTestServer(() => {
    return new net.Server(realConnectionListener)
  })

  interceptor.apply()
  const connectionListener = vi.fn()
  interceptor.on('connection', connectionListener)

  const socket = net.connect(server.port, server.hostname)
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const socketClosed = once(socket, 'close')

  interceptor.dispose()

  await expect(socketClosed).resolves.toEqual([false])
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect.soft(connectionListener).not.toHaveBeenCalled()
  expect.soft(realConnectionListener).not.toHaveBeenCalled()
})

it('closes a tls connection pending at the disposal without connecting to the real network', async () => {
  const realConnectionListener = vi.fn()
  await using server = await createRawTestServer(() => {
    return new net.Server(realConnectionListener)
  })

  interceptor.apply()
  const connectionListener = vi.fn()
  interceptor.on('connection', connectionListener)

  const socket = tls.connect(server.port, server.hostname)
  const errorListener = vi.fn()
  socket.on('error', errorListener)
  const socketClosed = once(socket, 'close')

  interceptor.dispose()

  await expect(socketClosed).resolves.toEqual([false])
  expect.soft(errorListener).not.toHaveBeenCalled()
  expect.soft(connectionListener).not.toHaveBeenCalled()
  expect.soft(realConnectionListener).not.toHaveBeenCalled()
})
