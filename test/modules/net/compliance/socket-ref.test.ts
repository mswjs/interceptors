// @vitest-environment node
import net from 'node:net'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer, spyOnSocket } from '#/test/helpers'

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

function createUnrefedServer(): net.Server {
  return new net.Server((socket) => {
    // Unref the server-side sockets so only the client-side
    // handles are reflected in the active resources count.
    socket.unref()
  })
}

it('returns the socket from "ref()" and "unref()"', async () => {
  await using server = await createTestServer(createUnrefedServer)

  const socket = net.connect(server.port, server.hostname)

  expect.soft(socket.unref()).toBe(socket)
  expect(socket.ref()).toBe(socket)

  socket.destroy()
})

it('does not hold the process once "unref()" is called', async () => {
  await using server = await createTestServer(createUnrefedServer)

  // Wait for the sockets from the previous tests to fully close.
  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.unref()

  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  socket.destroy()
})

it('holds the process again after "ref()"', async () => {
  await using server = await createTestServer(createUnrefedServer)

  // Wait for the sockets from the previous tests to fully close.
  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.unref()

  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  socket.ref()

  await expect.poll(() => countActiveTcpSockets()).toBeGreaterThan(0)

  socket.destroy()
})

it('stays unrefed when "unref()" is called while connecting', async () => {
  await using server = await createTestServer(createUnrefedServer)

  // Wait for the sockets from the previous tests to fully close.
  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.unref()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  await expect.poll(() => countActiveTcpSockets()).toBe(0)

  socket.destroy()
})
