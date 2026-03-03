// @vitest-environment react-native-like
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/helpers'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a request with an absolute URL', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('Hello world'))
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'https://example.com/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(200)
  expect(request.response).toBe('Hello world')
})

it('throws on a request with a relative URL', async () => {
  expect(() => {
    const request = new XMLHttpRequest()

    /**
     * @note Since the "location" is not present in React Native,
     * relative requests will throw (nothing to be relative to).
     * This is the correct behavior in React Native, where relative
     * requests are a no-op.
     */
    request.open('GET', '/relative/url')
    request.send()
  }).toThrow('Invalid URL')
})
