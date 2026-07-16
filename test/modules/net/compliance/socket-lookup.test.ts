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

function createLookupFunction(): net.LookupFunction {
  return (hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: '127.0.0.1', family: 4 }])
      return
    }

    callback(null, '127.0.0.1', 4)
  }
}

it('invokes the custom "lookup" function', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const lookupFunction = vi.fn(createLookupFunction())
  const socket = net.connect({
    port: server.port,
    host: 'imaginary.example.com',
    lookup: lookupFunction,
  })
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect(lookupFunction).toHaveBeenCalledOnce()
  expect(lookupFunction).toHaveBeenCalledWith(
    'imaginary.example.com',
    expect.objectContaining({ all: true }),
    expect.any(Function)
  )
})

it('connects to the address resolved by the custom "lookup" function', async () => {
  const serverConnectionListener = vi.fn()
  await using server = await createTestServer(() => {
    /**
     * @note Keep the connection open so the remote address info
     * can be read while the socket is still connected.
     */
    return new net.Server(() => {
      serverConnectionListener()
    })
  })

  const socket = net.connect({
    port: server.port,
    host: 'imaginary.example.com',
    lookup: createLookupFunction(),
  })
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(server.port)

  await expect.poll(() => serverConnectionListener).toHaveBeenCalledOnce()

  socket.destroy()
})

it('resolves a passthrough connection with the custom "lookup" function', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end('hello from server')
    })
  })

  interceptor.on('connection', ({ controller }) => {
    controller.passthrough()
  })

  // Resolve the imaginary hostname to the test server address.
  const lookupFunction = vi.fn(createLookupFunction())
  const socket = net.connect({
    port: server.port,
    host: 'imaginary.example.com',
    lookup: lookupFunction,
  })
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<Buffer> = []

  socket.on('data', (chunk) => {
    receivedChunks.push(chunk)
  })

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  // The custom lookup function must drive the passthrough connection.
  expect.soft(lookupFunction).toHaveBeenCalledWith(
    'imaginary.example.com',
    expect.objectContaining({ all: true }),
    expect.any(Function)
  )
  expect.soft(Buffer.concat(receivedChunks).toString()).toBe(
    'hello from server'
  )
  expect(listeners.error).not.toHaveBeenCalled()
})

it('errors a passthrough connection if the custom "lookup" function fails', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  interceptor.on('connection', ({ controller }) => {
    controller.passthrough()
  })

  const lookupFunction = vi.fn<net.LookupFunction>((...args) => {
    const callback = args[args.length - 1] as (error: Error) => void
    callback(new Error('Custom lookup failure'))
  })
  const socket = net.connect({
    port: server.port,
    host: 'imaginary.example.com',
    lookup: lookupFunction,
  })
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(lookupFunction).toHaveBeenCalledOnce()
  expect
    .soft(listeners.error)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Custom lookup failure' })
    )
  expect.soft(listeners.close).toHaveBeenCalledWith(true)
  expect(listeners.connect).not.toHaveBeenCalled()
})

it('does not mutate the connection options', async () => {
  await using server = await createTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const lookupFunction = createLookupFunction()
  const connectionOptions = {
    port: server.port,
    host: server.hostname,
    lookup: lookupFunction,
  }

  const socket = net.connect(connectionOptions)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(Object.keys(connectionOptions)).toEqual([
    'port',
    'host',
    'lookup',
  ])
  expect.soft(connectionOptions.port).toBe(server.port)
  expect.soft(connectionOptions.host).toBe(server.hostname)
  expect(connectionOptions.lookup).toBe(lookupFunction)
})
