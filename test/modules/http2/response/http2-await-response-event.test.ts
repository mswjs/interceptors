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

it('awaits asynchronous response event listener for a mocked response', async () => {
  const tag = vi.fn<(tag: string) => void>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })
  interceptor.on('response', async ({ response }) => {
    tag('response')
    await response.text()
    tag('after-response')
  })

  await using session = connectHttp2Session('http://api.example.com')
  tag('before-request')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  tag('after-request')

  await expect(response.text()).resolves.toBe('hello world')

  expect.soft(tag).toHaveBeenNthCalledWith(1, 'before-request')
  expect.soft(tag).toHaveBeenNthCalledWith(2, 'response')
  expect.soft(tag).toHaveBeenNthCalledWith(3, 'after-response')
  expect.soft(tag).toHaveBeenNthCalledWith(4, 'after-request')
})

it('awaits asynchronous response event listener for the original response', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const tag = vi.fn<(tag: string) => void>()

  interceptor.on('response', async ({ response }) => {
    tag('response')
    await response.text()
    tag('after-response')
  })

  await using session = connectHttp2Session(server.http.url('/'))
  tag('before-request')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  tag('after-request')

  await expect(response.text()).resolves.toBe('original-response')

  expect.soft(tag).toHaveBeenNthCalledWith(1, 'before-request')
  expect.soft(tag).toHaveBeenNthCalledWith(2, 'response')
  expect.soft(tag).toHaveBeenNthCalledWith(3, 'after-response')
  expect.soft(tag).toHaveBeenNthCalledWith(4, 'after-request')
})
