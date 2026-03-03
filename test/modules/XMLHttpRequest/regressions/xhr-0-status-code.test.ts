// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/335
 */
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('handles Response.error() as a request error', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const loadListener = vi.fn()
  const errorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.open('GET', 'http://localhost')
  request.addEventListener('load', loadListener)
  request.addEventListener('error', errorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(0)
  expect(request.readyState).toBe(4)
  expect(request.response).toBe('')
  expect(loadListener).not.toBeCalled()
  expect(errorListener).toHaveBeenCalledTimes(1)
})

it('handles interceptor exceptions as 500 error responses', async () => {
  interceptor.once('request', () => {
    throw new Error('Network error')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://localhost')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.readyState).toBe(4)
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})
