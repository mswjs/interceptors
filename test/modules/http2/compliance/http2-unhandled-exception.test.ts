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

it('handles a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})

it('treats unhandled listener errors as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(500)
  await expect(response.json()).resolves.toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('responds with a 500 response if the "unhandledException" listener does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(unhandledExceptionListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ error: new Error('Custom error') })
  )
  expect(response.status).toBe(500)
})

it('responds with the mocked response from the "unhandledException" listener', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', ({ controller }) => {
    controller.respondWith(new Response('fallback response'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('fallback response')
})

it('resets the request errored from the "unhandledException" listener', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', ({ controller }) => {
    controller.errorWith(new Error('Fallback error'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const [streamError] = await once(stream, 'error')

  expect.soft(streamError.code).toBe('ERR_HTTP2_STREAM_ERROR')
  expect.soft(stream.rstCode).toBe(http2.constants.NGHTTP2_INTERNAL_ERROR)
})
