// @vitest-environment jsdom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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

it('responds with an empty mocked response to an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 401,
        statusText: 'Unauthorized',
      })
    )
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(401)
  expect.soft(request.response).toEqual('')
})

it('responds with an empty mocked response to an HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 401,
        statusText: 'Unauthorized',
      })
    )
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(401)
  expect.soft(request.response).toEqual('')
})
