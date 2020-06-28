import http from 'http'
import { RequestInterceptor } from '../../src'

function createServer(port = 1337, host = 'localhost'): Promise<http.Server> {
  const server = http.createServer((_, res) => {
    res.writeHead(200)
    res.end('OK')
  })
  server.on('connection', (socket) => {
    socket.on('close', () => {
      // Special event that we can use to make sure that we are assering when
      // server is done with the response
      server.emit('connection-end')
    })
  })
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server))
  })
}

function intercept() {
  let interceptor: RequestInterceptor | null = new RequestInterceptor()
  interceptor.use(() => {
    // Empty middleware that should allow request to bypass
  })
  return () => {
    if (interceptor) {
      interceptor.restore()
      interceptor = null
    }
  }
}

test('http.get should handle original response', async (done) => {
  const restore = intercept()
  const server = await createServer()

  let data = ''

  const callback = jest.fn((res) => {
    res.on('data', (chunk: string) => {
      data += chunk
    })
  })

  server.on('connection-end', () => {
    // Restore everything first, otherwise if the test fails, jest will be stuck
    // with the still running server
    restore()
    server.close()

    expect(callback).toBeCalledTimes(1)
    expect(data).toBe('OK')

    done()
  })

  // This starts the request but the assertion will happen when the server is
  // done with the request in "connection-end" event handler
  http.get('http://localhost:1337', callback)
})
