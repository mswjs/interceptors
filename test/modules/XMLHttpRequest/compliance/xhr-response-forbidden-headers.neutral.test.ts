// @vitest-environment happy-dom
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

it('does not propagate the forbidden "cookie" header on the bypassed response', async () => {
  const request = new XMLHttpRequest()
  request.open('POST', server.https.url('/cookie'))
  request.setRequestHeader('Set-Cookie', 'foo=bar')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getAllResponseHeaders()).not.toMatch(/cookie/)
})
