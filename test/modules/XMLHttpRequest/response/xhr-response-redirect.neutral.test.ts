// @vitest-environment jsdom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const server = getTestServer()

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a bypassed request with a redirect response', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/redirect'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getResponseHeader('content-type'))
    .toBe('text/html; charset=utf-8')
  expect.soft(request.response).toBe('destination-body')
  expect
    .soft(request.responseURL)
    .toBe(server.http.url('/redirect/destination').href)
})

it('responds with a mocked redirect response', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        new Response(null, {
          status: 301,
          headers: {
            location: new URL('/destination', request.url).href,
          },
        })
      )
    }

    controller.respondWith(new Response('destination-body'))
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/original')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getResponseHeader('content-type'))
    .toBe('text/plain;charset=UTF-8')
  expect.soft(request.response).toBe('destination-body')
  expect.soft(request.responseURL).toBe('http://any.host.here/destination')
})
