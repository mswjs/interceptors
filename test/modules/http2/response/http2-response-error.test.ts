// @vitest-environment node
import http2 from 'node:http2'
import { once } from 'node:events'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { connectHttp2Session, toHttp2WebResponse } from '#/test/helpers'

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

it('resets the request for a mocked "Response.error()"', async () => {
  const responseListener = vi.fn()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })
  interceptor.on('response', responseListener)

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const [streamError] = await once(stream, 'error')

  expect.soft(streamError.code).toBe('ERR_HTTP2_STREAM_ERROR')
  expect.soft(stream.rstCode).toBe(http2.constants.NGHTTP2_INTERNAL_ERROR)
  expect(responseListener).not.toHaveBeenCalled()
})

it('resets the request for a thrown "Response.error()"', async () => {
  interceptor.on('request', () => {
    throw Response.error()
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const [streamError] = await once(stream, 'error')

  expect.soft(streamError.code).toBe('ERR_HTTP2_STREAM_ERROR')
  expect.soft(stream.rstCode).toBe(http2.constants.NGHTTP2_INTERNAL_ERROR)
})

it('resets the request errored by the listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('Custom error'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const [streamError] = await once(stream, 'error')

  expect.soft(streamError.code).toBe('ERR_HTTP2_STREAM_ERROR')
  expect.soft(stream.rstCode).toBe(http2.constants.NGHTTP2_INTERNAL_ERROR)
})

it('handles subsequent requests of the session after a request is errored', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/error')) {
      controller.respondWith(Response.error())
      return
    }

    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const erroredStream = session.request({ ':path': '/error' })
  await once(erroredStream, 'error')

  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe('hello world')
})
