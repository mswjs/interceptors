// @vitest-environment node
import http2 from 'node:http2'
import { setTimeout as sleep } from 'node:timers/promises'
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

it('handles concurrent requests of the same session independently', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(new URL(request.url).pathname))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const responses = await Promise.all([
    toHttp2WebResponse(session.request({ ':path': '/one' })),
    toHttp2WebResponse(session.request({ ':path': '/two' })),
    toHttp2WebResponse(session.request({ ':path': '/three' })),
  ])

  await expect(responses[0].text()).resolves.toBe('/one')
  await expect(responses[1].text()).resolves.toBe('/two')
  await expect(responses[2].text()).resolves.toBe('/three')
})

it('handles subsequent requests of the same session', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(new URL(request.url).pathname))
  })

  await using session = connectHttp2Session('http://api.example.com')

  const firstResponse = await toHttp2WebResponse(
    session.request({ ':path': '/one' })
  )
  await expect(firstResponse.text()).resolves.toBe('/one')

  const secondResponse = await toHttp2WebResponse(
    session.request({ ':path': '/two' })
  )
  await expect(secondResponse.text()).resolves.toBe('/two')
})

it('mocks one request and performs another of the same session as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/mocked')) {
      controller.respondWith(new Response('mocked-response'))
    }
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const [mockedResponse, originalResponse] = await Promise.all([
    toHttp2WebResponse(session.request({ ':path': '/mocked' })),
    toHttp2WebResponse(session.request({ ':path': '/original' })),
  ])

  await expect(mockedResponse.text()).resolves.toBe('mocked-response')
  await expect(originalResponse.text()).resolves.toBe('original-response')
})

it('does not block a request on a slower request of the same session', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    if (request.url.endsWith('/slow')) {
      await sleep(200)
    }

    controller.respondWith(new Response(new URL(request.url).pathname))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const responseOrder: Array<string> = []

  await Promise.all([
    toHttp2WebResponse(session.request({ ':path': '/slow' })).then(() => {
      responseOrder.push('/slow')
    }),
    toHttp2WebResponse(session.request({ ':path': '/fast' })).then(() => {
      responseOrder.push('/fast')
    }),
  ])

  expect(responseOrder).toEqual(['/fast', '/slow'])
})

it('handles requests of different sessions independently', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using firstSession = connectHttp2Session('http://one.example.com')
  await using secondSession = connectHttp2Session('http://two.example.com')

  const [firstResponse, secondResponse] = await Promise.all([
    toHttp2WebResponse(firstSession.request({ ':path': '/' })),
    toHttp2WebResponse(secondSession.request({ ':path': '/' })),
  ])

  await expect(firstResponse.text()).resolves.toBe('http://one.example.com/')
  await expect(secondResponse.text()).resolves.toBe('http://two.example.com/')
})
