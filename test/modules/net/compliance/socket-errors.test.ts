// @vitest-environment node
import net from 'node:net'
import os from 'node:os'
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

it.each(['throw', 'reject'] as const)(
  'destroys the socket when a connection listener fails with %s',
  async (failure) => {
    const error = new Error('Connection listener failed')
    interceptor.on('connection', () => {
      if (failure === 'throw') {
        throw error
      }

      return Promise.reject(error)
    })
    const nextListener = vi.fn()
    interceptor.on('connection', nextListener)

    const socket = net.connect(80, '127.0.0.1')
    onTestFinished(() => {
      socket.destroy()
    })
    const { listeners } = spyOnSocket(socket)

    await expect.poll(() => listeners.close).toHaveBeenCalledExactlyOnceWith(true)
    expect(listeners.error).toHaveBeenCalledOnce()
    expect(listeners.error.mock.calls[0][0]).toBe(error)
    expect(socket.destroyed).toBe(true)
    expect(nextListener).not.toHaveBeenCalled()
  }
)

it('emits the "ECONNREFUSED" error identical to Node.js', async () => {
  // Open a server to obtain a port, then close it
  // so connecting to that port is guaranteed to be refused.
  const closedServer = await createRawTestServer(() => {
    return new net.Server()
  })
  const refusedPort = closedServer.port
  await closedServer[Symbol.asyncDispose]()

  const socket = net.connect(refusedPort, '127.0.0.1')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()

  const [connectionError] = listeners.error.mock.calls[0]

  expect.soft(connectionError).toBeInstanceOf(Error)
  expect.soft(Object.keys(connectionError)).toEqual([
    'errno',
    'code',
    'syscall',
    'address',
    'port',
  ])
  expect.soft(connectionError.code).toBe('ECONNREFUSED')
  expect.soft(connectionError.errno).toBe(-os.constants.errno.ECONNREFUSED)
  expect.soft(connectionError.syscall).toBe('connect')
  expect.soft(connectionError.address).toBe('127.0.0.1')
  expect.soft(connectionError.port).toBe(refusedPort)
  expect(connectionError.message).toBe(
    `connect ECONNREFUSED 127.0.0.1:${refusedPort}`
  )

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect.soft(listeners.close).toHaveBeenCalledWith(true)
  expect(listeners.connect).not.toHaveBeenCalled()
})

it('emits the "ENOTFOUND" error identical to Node.js', async () => {
  /**
   * @note The "invalid." top-level domain is reserved (RFC 6761)
   * and is guaranteed to never resolve.
   */
  const socket = net.connect(80, 'host.invalid')
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()

  const [connectionError] = listeners.error.mock.calls[0]

  expect.soft(connectionError).toBeInstanceOf(Error)
  expect.soft(Object.keys(connectionError)).toEqual([
    'errno',
    'code',
    'syscall',
    'hostname',
  ])
  expect.soft(connectionError.code).toBe('ENOTFOUND')
  // The "EAI_NONAME" libuv constant, identical on all platforms.
  expect.soft(connectionError.errno).toBe(-3008)
  expect.soft(connectionError.syscall).toBe('getaddrinfo')
  expect.soft(connectionError.hostname).toBe('host.invalid')
  expect(connectionError.message).toBe('getaddrinfo ENOTFOUND host.invalid')

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect.soft(listeners.close).toHaveBeenCalledWith(true)
  expect(listeners.connect).not.toHaveBeenCalled()
})
