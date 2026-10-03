// @vitest-environment node
import http2 from 'node:http2'
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

it('forwards the original response trailers', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.respond({ ':status': 200 }, { waitForTrailers: true })
      stream.once('wantTrailers', () => {
        stream.sendTrailers({ 'x-status': 'done' })
      })
      stream.end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const trailersListener =
    vi.fn<(trailers: http2.IncomingHttpHeaders) => void>()
  stream.on('trailers', trailersListener)
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('original-response')
  expect(trailersListener).toHaveBeenCalledOnce()
  expect(trailersListener.mock.calls[0][0]).toMatchObject({
    'x-status': 'done',
  })
})

it('forwards the original response trailers with a response listener present', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.respond({ ':status': 200 }, { waitForTrailers: true })
      stream.once('wantTrailers', () => {
        stream.sendTrailers({ 'x-status': 'done' })
      })
      stream.end('original-response')
    })
  })

  interceptor.on('response', async ({ response }) => {
    await response.text()
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const trailersListener =
    vi.fn<(trailers: http2.IncomingHttpHeaders) => void>()
  stream.on('trailers', trailersListener)
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('original-response')
  expect(trailersListener).toHaveBeenCalledOnce()
  expect(trailersListener.mock.calls[0][0]).toMatchObject({
    'x-status': 'done',
  })
})

it('does not send any trailers for an original response without them', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const trailersListener = vi.fn()
  stream.on('trailers', trailersListener)
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('original-response')
  expect(trailersListener).not.toHaveBeenCalled()
})
