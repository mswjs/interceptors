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

it('exposes the request path', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/users/123' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/users/123'
  )
})

it('exposes the request query parameters', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/users?id=123&name=John' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/users?id=123&name=John'
  )
})

it('exposes the port of the request authority', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com:8080')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('http://api.example.com:8080/')
})

it('exposes the authority provided in the request headers', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/', ':authority': 'another.example.com' })
  )

  await expect(response.text()).resolves.toBe('http://another.example.com/')
})

it('uses the root path for a request without a path', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request())

  await expect(response.text()).resolves.toBe('http://api.example.com/')
})
