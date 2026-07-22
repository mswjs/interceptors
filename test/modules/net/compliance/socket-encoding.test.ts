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

const encodedWrites: Array<{ encoding: BufferEncoding; input: string }> = [
  { encoding: 'latin1', input: 'héllo wörld' },
  { encoding: 'base64', input: Buffer.from('hello world').toString('base64') },
  { encoding: 'utf16le', input: 'hello world' },
]

for (const { encoding, input } of encodedWrites) {
  it(`delivers a "${encoding}" encoded write byte-identical`, async () => {
    const serverReceivedChunks: Array<Buffer> = []
    const serverEndListener = vi.fn()

    await using server = await createRawTestServer(() => {
      return new net.Server((socket) => {
        socket.on('data', (chunk) => {
          serverReceivedChunks.push(chunk)
        })
        socket.on('end', serverEndListener)
      })
    })

    const socket = net.connect(server.port, server.hostname)
    const { listeners } = spyOnSocket(socket)

    socket.resume()

    await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

    socket.write(input, encoding)
    socket.end()

    await expect.poll(() => serverEndListener).toHaveBeenCalledOnce()
    expect(Buffer.concat(serverReceivedChunks)).toEqual(
      Buffer.from(input, encoding)
    )
  })
}

it('flushes corked writes as a single chunk', async () => {
  const serverReceivedChunks: Array<Buffer> = []

  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.on('data', (chunk) => {
        serverReceivedChunks.push(chunk)
      })
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)

  socket.resume()

  await expect.poll(() => listeners.ready).toHaveBeenCalledOnce()

  socket.cork()
  socket.write('hello ')
  socket.write('world')
  socket.uncork()

  await expect
    .poll(() => Buffer.concat(serverReceivedChunks).toString())
    .toBe('hello world')

  expect(serverReceivedChunks).toHaveLength(1)

  socket.destroy()
})

it('receives the response as a string after "setEncoding()"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end('hello world')
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<unknown> = []

  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    receivedChunks.push(chunk.toString())
  })

  await expect.poll(() => listeners.end).toHaveBeenCalledOnce()

  expect.soft(receivedChunks.every((chunk) => typeof chunk === 'string')).toBe(
    true
  )
  expect(receivedChunks.join('')).toBe('hello world')
})

it('receives the response in the encoding set by "setEncoding()"', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.end('hello world')
    })
  })

  const socket = net.connect(server.port, server.hostname)
  const { listeners } = spyOnSocket(socket)
  const receivedChunks: Array<string> = []

  socket.setEncoding('hex')
  socket.on('data', (chunk) => {
    receivedChunks.push(chunk.toString())
  })

  await expect.poll(() => listeners.end).toHaveBeenCalledOnce()

  expect(receivedChunks.join('')).toBe(
    Buffer.from('hello world').toString('hex')
  )
})
