// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/interceptors/issues/308
 */
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

it('bypasses a compressed HTTP request', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/compressed'))
  request.setRequestHeader('x-accept-encoding', 'gzip')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(200)
  expect(request.response).toBe('hello world')
  expect(request.responseText).toBe('hello world')
})
