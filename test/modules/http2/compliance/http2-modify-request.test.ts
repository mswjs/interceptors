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

it('allows modifying the request headers for a request without a body', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      response.end(`${request.headers['x-appended-header']}`)
    })
  })

  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('modified')
})

it('allows modifying the request headers for a request with a body', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      response.setHeader(
        'x-appended-header',
        request.headers['x-appended-header'] ?? ''
      )
      request.pipe(response)
    })
  })

  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('post-payload')
  const response = await toHttp2WebResponse(stream)

  expect(response.headers.get('x-appended-header')).toBe('modified')
  await expect(response.text()).resolves.toBe('post-payload')
})

it('allows removing the request headers', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      response.end(JSON.stringify('x-custom-header' in request.headers))
    })
  })

  interceptor.on('request', ({ request }) => {
    request.headers.delete('x-custom-header')
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/', 'x-custom-header': 'yes' })
  )

  await expect(response.json()).resolves.toBe(false)
})
