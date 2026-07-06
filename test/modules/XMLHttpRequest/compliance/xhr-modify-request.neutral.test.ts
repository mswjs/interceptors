// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

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

it('allows modifying outgoing request headers', async () => {
  interceptor.on('request', ({ request }) => {
    if (request.method === 'OPTIONS') {
      return
    }

    request.headers.delete('X-Delete-Header')
    request.headers.append('X-Append-Header', '2')
    request.headers.set('X-Set-Header', 'new-value')
  })

  // The test server echoes the request headers in the response.
  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/user'))
  request.setRequestHeader('X-Delete-Header', 'a')
  request.setRequestHeader('X-Append-Header', '1')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(
      request.getResponseHeader('x-delete-header'),
      'XMLHttpRequest headers cannot be deleted'
    )
    .toBe('a')
  expect
    .soft(
      request.getResponseHeader('x-append-header'),
      'Appends a new header value'
    )
    .toBe('1, 2')
  expect
    .soft(request.getResponseHeader('x-set-header'), 'Replace a header value')
    .toBe('new-value')
})
