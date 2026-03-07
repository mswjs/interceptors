// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

it('supports lowercase HTTP request method', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'POST') {
      controller.respondWith(new Response('hello world'))
    }
  })

  const request = new XMLHttpRequest()
  request.open('post', 'http://localhost/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.responseText).toBe('hello world')
})
