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

it('does not send the mocked response body for a HEAD request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', { headers: { 'content-length': '11' } })
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'HEAD', ':path': '/' })
  )

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('content-length')).toBe('11')
  await expect(response.text()).resolves.toBe('')
})

it('forwards the original response to a HEAD request', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(200, { 'content-length': '11' }).end()
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'HEAD', ':path': '/' })
  )

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('content-length')).toBe('11')
  await expect(response.text()).resolves.toBe('')
})
