// @vitest-environment node
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
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

async function createUnixSocketServer(): Promise<
  AsyncDisposable & { socketPath: string }
> {
  const socketPath = path.join(
    os.tmpdir(),
    `interceptors-${process.pid}-${Math.random().toString(32).slice(2)}.sock`
  )

  const server = new net.Server((socket) => {
    socket.end('hello from server')
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => {
      resolve()
    })
    server.once('error', reject)
  })

  return {
    socketPath,
    async [Symbol.asyncDispose]() {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
      fs.rmSync(socketPath, { force: true })
    },
  }
}

it('connects with "connect(port)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  // The host defaults to "localhost".
  const socket = net.connect(server.port)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()
  expect.soft(socket.remotePort).toBe(server.port)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(listeners.connect).toHaveBeenCalledOnce()
})

it('connects with "connect(port, callback)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.connect({ port: server.port }, connectionCallback)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
})

it('connects with "connect(port, host)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()
  expect.soft(socket.remotePort).toBe(server.port)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(listeners.connect).toHaveBeenCalledOnce()
})

it('connects with "connect(port, host, callback)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.connect(server.port, server.hostname, connectionCallback)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
})

it('connects with "connect(options)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const socket = net.connect({
    port: server.port,
    host: server.hostname,
  })
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()
  expect.soft(socket.remotePort).toBe(server.port)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()
  expect(listeners.connect).toHaveBeenCalledOnce()
})

it('connects with "connect(options, callback)"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.connect(
    {
      port: server.port,
      host: server.hostname,
    },
    connectionCallback
  )
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
})

it('connects with "connect(path)"', async () => {
  await using server = await createUnixSocketServer()

  const socket = net.connect(server.socketPath)
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<Buffer> = []

  socket.on('data', (chunk) => {
    receivedChunks.push(chunk)
  })

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect.soft(Buffer.concat(receivedChunks).toString()).toBe(
    'hello from server'
  )
  // Unix socket connections expose no remote address info.
  expect.soft(socket.remoteAddress).toBeUndefined()
  expect(socket.localAddress).toBeUndefined()
})

it('connects with "connect(path, callback)"', async () => {
  await using server = await createUnixSocketServer()

  const connectionCallback = vi.fn()
  const socket = net.connect(server.socketPath, connectionCallback)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
})

it('connects with "connect(options)" and the "path" option', async () => {
  await using server = await createUnixSocketServer()

  const socket = net.connect({ path: server.socketPath })
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<Buffer> = []

  socket.on('data', (chunk) => {
    receivedChunks.push(chunk)
  })

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(Buffer.concat(receivedChunks).toString()).toBe('hello from server')
})

it('throws on a URL argument without a port, like Node.js', async () => {
  /**
   * @note Node.js does not support URL arguments. It treats them as
   * a plain options object, reading "url.port" (an empty string when
   * the URL has no explicit port), and throws synchronously.
   */
  expect(() => {
    return net.connect(new URL('http://example.com/') as unknown as string)
  }).toThrow('Port should be >= 0 and < 65536')
})

it('fails to connect with a URL argument, like Node.js', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server(() => {})
  })

  /**
   * @note Node.js reads "url.host" as the host, which includes the
   * port. Such a hostname never resolves, so the connection fails
   * even when the URL points at a live server.
   */
  const socket = net.connect(
    new URL(`http://${server.hostname}:${server.port}/`) as unknown as string
  )
  const { listeners } = spyOnSocket(socket)

  await expect.poll(() => listeners.error).toHaveBeenCalledOnce()

  const [connectionError] = listeners.error.mock.calls[0]
  expect.soft(connectionError.code).toBe('ENOTFOUND')
  expect.soft(connectionError.hostname).toBe(
    `${server.hostname}:${server.port}`
  )
  expect(listeners.connect).not.toHaveBeenCalled()
})

it('connects with "createConnection()"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.createConnection(
    server.port,
    server.hostname,
    connectionCallback
  )
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  expect.soft(listeners.connect).toHaveBeenCalledOnce()
  expect(connectionCallback).toHaveBeenCalledOnce()
})

it('notifies connect again for passthrough decided after the client writes', async () => {
  const receivedChunks: Array<Buffer> = []
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', (chunk) => {
        receivedChunks.push(chunk)
        socket.end('original')
      })
    })
  })

  interceptor.on('connection', ({ socket, controller }) => {
    socket.once('data', async () => {
      // No real connection can be chosen before the client sends its bytes.
      await setImmediate()
      controller.passthrough()
    })
  })

  const connectionCallback = vi.fn()
  const socket = net.connect(server.port, server.hostname, connectionCallback)
  onTestFinished(() => {
    socket.destroy()
  })
  const { listeners } = spyOnSocket(socket)
  const response = Promise.withResolvers<string>()
  socket.on('error', response.reject)
  socket.on('data', (chunk) => response.resolve(chunk.toString()))
  socket.once('connect', () => socket.write('request'))

  await expect(response.promise).resolves.toBe('original')
  await expect.poll(() => listeners.close).toHaveBeenCalledOnce()

  // Synthetic connect obtains the request; real connect completes passthrough.
  expect(listeners.connect).toHaveBeenCalledTimes(2)
  // Once wrappers are consumed by synthetic connect, including the callback.
  expect(connectionCallback).toHaveBeenCalledOnce()
  expect(Buffer.concat(receivedChunks).toString()).toBe('request')
})
