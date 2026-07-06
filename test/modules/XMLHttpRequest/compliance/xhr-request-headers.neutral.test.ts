// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('sends the request headers to the server', async () => {
  // The test server echoes the request headers in the response.
  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/'))
  request.setRequestHeader('X-ClienT-HeadeR', 'abc-123')
  request.setRequestHeader('X-Multi-Value', 'value1; value2')
  request.send()

  await waitForXMLHttpRequest(request)

  // Normalized request headers list all headers in lower-case.
  expect(request.getResponseHeader('x-client-header')).toBe('abc-123')
  expect(request.getResponseHeader('x-multi-value')).toBe('value1; value2')
})
