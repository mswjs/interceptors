// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/msw/issues/273
 */
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  if (request.url === 'https://test.mswjs.io/user') {
    controller.respondWith(
      new Response(JSON.stringify({ mocked: true }), {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
          'x-header': 'yes',
        },
      })
    )
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('calls the "load" event attached via "addEventListener" with a mocked response', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', 'https://test.mswjs.io/user')
  request.responseType = 'json'
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(200)
  expect(request.getAllResponseHeaders()).toEqual(
    `content-type: application/json\r\nx-header: yes`
  )
  expect(request.response).toEqual({ mocked: true })
})
