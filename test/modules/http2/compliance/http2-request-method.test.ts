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

it('exposes the method of a GET request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'GET', ':path': '/' })
  )

  await expect(response.text()).resolves.toBe('GET')
})

it('exposes the method of a POST request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('payload')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('POST')
})

it('exposes the method of a PUT request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'PUT', ':path': '/' })
  stream.end('payload')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('PUT')
})

it('exposes the method of a PATCH request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'PATCH', ':path': '/' })
  stream.end('payload')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('PATCH')
})

it('exposes the method of a DELETE request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'DELETE', ':path': '/' })
  )

  await expect(response.text()).resolves.toBe('DELETE')
})

it('exposes the method of an OPTIONS request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.method))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'OPTIONS', ':path': '/' })
  stream.end()
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('OPTIONS')
})

it('exposes the method of a HEAD request', async () => {
  const requestMethodListener = vi.fn<(method: string) => void>()
  interceptor.on('request', ({ request, controller }) => {
    requestMethodListener(request.method)
    controller.respondWith(new Response(null))
  })

  await using session = connectHttp2Session('http://api.example.com')
  await toHttp2WebResponse(
    session.request({ ':method': 'HEAD', ':path': '/' })
  )

  expect(requestMethodListener).toHaveBeenCalledExactlyOnceWith('HEAD')
})
