// @vitest-environment node
import http2 from 'node:http2'
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

it('delays a mocked response by the listener', async () => {
  interceptor.on('request', async ({ controller }) => {
    await sleep(300)
    controller.respondWith(new Response('mocked-response'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const requestStart = performance.now()
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  const requestEnd = performance.now()

  await expect(response.text()).resolves.toBe('mocked-response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(250)
})

it('delays the original response by the listener', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  interceptor.on('request', async () => {
    await sleep(300)
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const requestStart = performance.now()
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  const requestEnd = performance.now()

  await expect(response.text()).resolves.toBe('original-response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(250)
})
