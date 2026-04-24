// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

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

it('mocks a response to a request with a relative url', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = new XMLHttpRequest()
  request.open('GET', '/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('hello world')
})
