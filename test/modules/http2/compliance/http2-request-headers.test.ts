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

it('exposes the request headers', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(Response.json(Object.fromEntries(request.headers)))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({
      ':path': '/',
      accept: 'application/json',
      'x-custom-header': 'yes',
    })
  )

  await expect(response.json()).resolves.toEqual({
    accept: 'application/json',
    'x-custom-header': 'yes',
  })
})

it('does not expose the pseudo-headers as the request headers', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(Response.json(Array.from(request.headers.keys())))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'GET', ':path': '/', 'x-custom-header': 'yes' })
  )

  await expect(response.json()).resolves.toEqual(['x-custom-header'])
})

it('exposes multiple values of the same request header', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.headers.get('x-custom-header')))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/', 'x-custom-header': ['one', 'two'] })
  )

  await expect(response.text()).resolves.toBe('one, two')
})

it('normalizes the request header names to lowercase', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(Response.json(Array.from(request.headers.keys())))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/', 'X-Custom-Header': 'yes' })
  )

  await expect(response.json()).resolves.toEqual(['x-custom-header'])
})
