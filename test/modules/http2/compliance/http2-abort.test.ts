// @vitest-environment node
import http2 from 'node:http2'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
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

it('aborts the request signal when the client cancels the request', async () => {
  const abortListener = vi.fn()
  const pendingRequest = Promise.withResolvers<void>()

  interceptor.on('request', async ({ request }) => {
    request.signal.addEventListener('abort', abortListener)
    pendingRequest.resolve()
    await new Promise<void>((resolve) => {
      request.signal.addEventListener('abort', () => resolve())
    })
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.on('error', () => {})

  await pendingRequest.promise
  stream.close(http2.constants.NGHTTP2_CANCEL)

  await expect.poll(() => abortListener).toHaveBeenCalledOnce()
})

it('cancels the original request when the client cancels the request', async () => {
  const originalStreamCloseListener = vi.fn<(code: number) => void>()
  const pendingOriginalRequest = Promise.withResolvers<void>()

  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.on('error', () => {})
      stream.on('close', () => {
        originalStreamCloseListener(stream.rstCode)
      })
      pendingOriginalRequest.resolve()
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.on('error', () => {})

  await pendingOriginalRequest.promise
  stream.close(http2.constants.NGHTTP2_CANCEL)

  await expect
    .poll(() => originalStreamCloseListener)
    .toHaveBeenCalledExactlyOnceWith(http2.constants.NGHTTP2_CANCEL)
})

it('handles subsequent requests of the session after a request is canceled', async () => {
  const pendingRequest = Promise.withResolvers<void>()

  interceptor.on('request', async ({ request, controller }) => {
    if (request.url.endsWith('/canceled')) {
      pendingRequest.resolve()
      await new Promise<void>((resolve) => {
        request.signal.addEventListener('abort', () => resolve())
      })
      return
    }

    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const canceledStream = session.request({
    ':method': 'POST',
    ':path': '/canceled',
  })
  canceledStream.on('error', () => {})

  await pendingRequest.promise
  canceledStream.close(http2.constants.NGHTTP2_CANCEL)
  await once(canceledStream, 'close')

  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe('hello world')
})

it('does not abort the request signal of a handled request', async () => {
  const requestSignals: Array<AbortSignal> = []
  interceptor.on('request', ({ request, controller }) => {
    requestSignals.push(request.signal)
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const streamCloseListener = vi.fn()
  stream.on('close', streamCloseListener)
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('hello world')
  await expect.poll(() => streamCloseListener).toHaveBeenCalledOnce()
  expect(requestSignals).toHaveLength(1)
  expect(requestSignals[0].aborted).toBe(false)
})

it('does not send the mocked response to a request canceled while the response listeners run', async () => {
  const pendingResponseListener = Promise.withResolvers<void>()
  const responseListenerDone = vi.fn()

  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/canceled')) {
      controller.respondWith(new Response('mocked-response'))
      return
    }

    controller.respondWith(new Response('hello world'))
  })
  interceptor.on('response', async ({ request }) => {
    if (request.url.endsWith('/canceled')) {
      pendingResponseListener.resolve()
      await sleep(100)
      responseListenerDone()
    }
  })

  await using session = connectHttp2Session('http://api.example.com')
  const canceledStream = session.request({
    ':method': 'POST',
    ':path': '/canceled',
  })
  const responseHeadersListener = vi.fn()
  canceledStream.on('response', responseHeadersListener)
  canceledStream.on('error', () => {})

  await pendingResponseListener.promise
  canceledStream.close(http2.constants.NGHTTP2_CANCEL)

  await expect.poll(() => responseListenerDone).toHaveBeenCalledOnce()
  expect(responseHeadersListener).not.toHaveBeenCalled()

  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )
  await expect(response.text()).resolves.toBe('hello world')
})

it('does not forward the original response to a request canceled while the response listeners run', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const pendingResponseListener = Promise.withResolvers<void>()
  const responseListenerDone = vi.fn()

  interceptor.on('response', async ({ request }) => {
    if (request.url.endsWith('/canceled')) {
      pendingResponseListener.resolve()
      await sleep(100)
      responseListenerDone()
    }
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const canceledStream = session.request({
    ':method': 'POST',
    ':path': '/canceled',
  })
  canceledStream.end()
  const responseHeadersListener = vi.fn()
  canceledStream.on('response', responseHeadersListener)
  canceledStream.on('error', () => {})

  await pendingResponseListener.promise
  canceledStream.close(http2.constants.NGHTTP2_CANCEL)

  await expect.poll(() => responseListenerDone).toHaveBeenCalledOnce()
  expect(responseHeadersListener).not.toHaveBeenCalled()

  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )
  await expect(response.text()).resolves.toBe('original-response')
})

it('stops reading a mocked response stream once the client cancels the request', async () => {
  const streamCancelListener = vi.fn()
  const encoder = new TextEncoder()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new ReadableStream({
          async pull(streamController) {
            await sleep(20)
            streamController.enqueue(encoder.encode('chunk'))
          },
          cancel() {
            streamCancelListener()
          },
        })
      )
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  stream.on('error', () => {})

  await once(stream, 'data')
  stream.close(http2.constants.NGHTTP2_CANCEL)

  await expect.poll(() => streamCancelListener).toHaveBeenCalledOnce()
})
