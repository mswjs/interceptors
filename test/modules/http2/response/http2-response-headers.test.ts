// @vitest-environment node
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

it('responds with the mocked response headers', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'content-type': 'text/plain',
          'x-custom-header': 'yes',
        },
      })
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect.soft(response.headers.get('content-type')).toBe('text/plain')
  expect.soft(response.headers.get('x-custom-header')).toBe('yes')
})

it('responds with the content type inferred from the mocked response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ id: 1 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.headers.get('content-type')).toBe('application/json')
})

it('responds with multiple values of the same mocked response header', async () => {
  interceptor.on('request', ({ controller }) => {
    const headers = new Headers()
    headers.append('x-custom-header', 'one')
    headers.append('x-custom-header', 'two')
    controller.respondWith(new Response('hello world', { headers }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.headers.get('x-custom-header')).toBe('one, two')
})

it('responds with multiple mocked response cookies', async () => {
  interceptor.on('request', ({ controller }) => {
    const headers = new Headers()
    headers.append('set-cookie', 'a=1')
    headers.append('set-cookie', 'b=2')
    controller.respondWith(new Response('hello world', { headers }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
})

it('does not send the connection-specific mocked response headers', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          connection: 'keep-alive',
          'keep-alive': 'timeout=5',
          'transfer-encoding': 'chunked',
          'x-custom-header': 'yes',
        },
      })
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect.soft(response.headers.has('connection')).toBe(false)
  expect.soft(response.headers.has('keep-alive')).toBe(false)
  expect.soft(response.headers.has('transfer-encoding')).toBe(false)
  expect.soft(response.headers.get('x-custom-header')).toBe('yes')
  await expect(response.text()).resolves.toBe('hello world')
})
