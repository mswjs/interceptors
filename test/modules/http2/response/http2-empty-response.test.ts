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

it('responds with a mocked response without a body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(null))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('')
})

it('responds with a mocked response with an empty body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(''))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('')
})

it('responds with a mocked response with an empty stream', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new ReadableStream({
          start(streamController) {
            streamController.close()
          },
        })
      )
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('')
})
