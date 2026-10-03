// @vitest-environment node
import net from 'node:net'
import http2 from 'node:http2'
import { once } from 'node:events'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('resets the request when the original server resets it', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.on('error', () => {})
      stream.close(http2.constants.NGHTTP2_REFUSED_STREAM)
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const [streamError] = await once(stream, 'error')

  expect.soft(streamError.code).toBe('ERR_HTTP2_STREAM_ERROR')
  expect.soft(stream.rstCode).toBe(http2.constants.NGHTTP2_REFUSED_STREAM)
})

it('errors the session when the original server resets the connection', async () => {
  await using server = await createRawTestServer(() => {
    return net.createServer((socket) => {
      socket.resetAndDestroy()
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  stream.on('error', () => {})
  const [sessionError] = await once(session, 'error')

  expect(sessionError.code).toBe('ECONNRESET')
})

it('handles the requests of other sessions after a session errors', async () => {
  await using server = await createRawTestServer(() => {
    return net.createServer((socket) => {
      socket.resetAndDestroy()
    })
  })

  await using erroredSession = connectHttp2Session(server.http.url('/'))
  const erroredStream = erroredSession.request({ ':path': '/' })
  erroredStream.on('error', () => {})
  await once(erroredSession, 'error')

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('hello world')
})
