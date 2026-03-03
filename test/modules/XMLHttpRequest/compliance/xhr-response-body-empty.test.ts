// @vitest-environment jsdom
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(
    new Response(null, {
      status: 401,
      statusText: 'Unauthorized',
    })
  )
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('sends a mocked response with an empty response body', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', '/arbitrary-url')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toEqual(401)
  expect(request.response).toEqual('')
})
