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

it('responds with a mocked text response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('hello world')
})

it('responds with a mocked JSON response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ id: 1, name: 'John' }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.json()).resolves.toEqual({ id: 1, name: 'John' })
})

it('responds with a mocked binary response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(Uint8Array.from([0, 1, 2, 253, 254, 255]))
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.arrayBuffer()).resolves.toEqual(
    Uint8Array.from([0, 1, 2, 253, 254, 255]).buffer
  )
})

it('responds with a mocked Blob response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(new Blob(['hello world'], { type: 'text/plain' }))
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.headers.get('content-type')).toBe('text/plain')
  await expect(response.text()).resolves.toBe('hello world')
})

it('responds with a mocked response body larger than the flow control window', async () => {
  const responseBody = 'a'.repeat(1024 * 1024)
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(responseBody))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  const responseText = await response.text()

  expect(responseText.length).toBe(responseBody.length)
  expect(responseText === responseBody).toBe(true)
})

it('responds with a mocked response based on the request body', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    const user = await request.json()
    controller.respondWith(Response.json({ ...user, id: 1 }, { status: 201 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({
    ':method': 'POST',
    ':path': '/users',
    'content-type': 'application/json',
  })
  stream.end(JSON.stringify({ name: 'John' }))
  const response = await toHttp2WebResponse(stream)

  expect(response.status).toBe(201)
  await expect(response.json()).resolves.toEqual({ id: 1, name: 'John' })
})
