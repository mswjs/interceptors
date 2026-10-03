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

it('supports response patching', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(200, { 'x-custom-header': 'yes' }).end('hello')
    })
  })

  interceptor.on('request', async ({ request, controller }) => {
    if (!request.url.endsWith('/mocked')) {
      return
    }

    await using originalSession = connectHttp2Session(server.http.url('/'))
    const originalResponse = await toHttp2WebResponse(
      originalSession.request({ ':path': '/original' })
    )
    const originalResponseText = await originalResponse.text()

    controller.respondWith(
      new Response(`${originalResponseText} world`, {
        status: originalResponse.status,
        headers: {
          'x-custom-header':
            originalResponse.headers.get('x-custom-header') ?? '',
        },
      })
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/mocked' })
  )

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('x-custom-header')).toBe('yes')
  await expect(response.text()).resolves.toBe('hello world')
})
