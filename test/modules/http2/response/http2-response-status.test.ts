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

it('responds with a mocked 200 response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})

it('responds with a mocked 201 response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('created', { status: 201 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('payload')
  const response = await toHttp2WebResponse(stream)

  expect(response.status).toBe(201)
  await expect(response.text()).resolves.toBe('created')
})

it('responds with a mocked 204 response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(null, { status: 204 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(204)
  expect(response.body).toBe(null)
})

it('responds with a mocked redirect response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 301,
        headers: { location: 'http://api.example.com/redirected' },
      })
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect.soft(response.status).toBe(301)
  expect
    .soft(response.headers.get('location'))
    .toBe('http://api.example.com/redirected')
})

it('responds with a mocked 404 response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('not found', { status: 404 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(404)
  await expect(response.text()).resolves.toBe('not found')
})

it('responds with a mocked 500 response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('server error', { status: 500 }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(500)
  await expect(response.text()).resolves.toBe('server error')
})
