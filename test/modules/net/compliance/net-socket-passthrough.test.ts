// @vitest-environment node
import { SocketInterceptor } from '../../../../src/interceptors/net'
import net from 'node:net'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new SocketInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

async function defineRawServer(requestListener?: http.RequestListener<typeof http.IncomingMessage, typeof http.ServerResponse>): Promise<AsyncDisposable & { server: http.Server, url: URL, buildUrl(pathname: string): URL }> {
  const server = http.createServer(requestListener)

  const urlPromise = new DeferredPromise<URL>()

  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const url = new URL(typeof address === 'string' ? address : `http://${address?.address}:${address?.port}`)
    urlPromise.resolve(url)
  })

  const url = await urlPromise

  return {
    async [Symbol.asyncDispose]() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error)
            resolve()
        })
      })
    },
    server,
    url,
    buildUrl(pathname: string) {
      return new URL(pathname, url)
    }
  }
}

it('establishes actual server connection on passthrough', async () => {
  await using testServer = await defineRawServer((req, res) => {
    res.end()
  })

  interceptor.on('connection', ({ socket }) => {
    socket.passthrough()
  })

  const socket = net.connect(+testServer.url.port, testServer.url.hostname)
  const connectListener = vi.fn()
  const errorListener = vi.fn()

  socket
    .once('connect', function connectOne() {
      socket.write([
        'HEAD / HTTP/1.1',
        'Host: localhost',
        'Connection: close',
        '',
        ''
      ].join('\r\n'))
    })
    .once('connect', connectListener)

  await expect.poll(() => connectListener, {
    message: 'Must emit the connect event'
  }).toHaveBeenCalled()
  expect(connectListener).toHaveBeenCalledTimes(1)
  expect(errorListener).not.toHaveBeenCalled()
})

it('replays socket writes onto the passthrough connection', async () => {
  await using testServer = await defineRawServer((req, res) => {
    req.pipe(res)
  })

  interceptor.on('connection', ({ socket }) => {
    socket.passthrough()
  })

  const socket = net.connect(+testServer.url.port, testServer.url.hostname)

  const dataListener = vi.fn()
  const closeListener = vi.fn()
  const errorListener = vi.fn()

  socket
    .once('connect', function onceConnect() {
      socket.write([
        'POST / HTTP/1.1',
        'Host: localhost',
        'Content-Type: text/plain',
        'Content-Length: 11',
        'Connection: close',
        '',
        'hello world',
      ].join('\r\n'))
    })
    .on('data', (chunk) => dataListener(chunk.toString()))
    .on('error', errorListener)
    .on('close', closeListener)

  await expect.poll(() => closeListener).toHaveBeenCalled()
  expect(errorListener).not.toHaveBeenCalled()
  expect(dataListener).toHaveBeenCalledTimes(1)
  expect(dataListener).toHaveBeenCalledWith(expect.stringContaining('hello world'))
})
