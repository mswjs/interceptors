// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/msw/issues/2307
 */
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchResponse } from '#/src/utils/fetchUtils'
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

it('handles non-configurable responses from the actual server', async () => {
  const responseListener = vi.fn()
  interceptor.on('response', responseListener)

  const url = server.http.url('/status')
  const request = new XMLHttpRequest()
  request.open('POST', url)
  request.send('101')

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(101)
  expect.soft(request.statusText).toBe('Switching Protocols')
  expect.soft(request.responseText).toBe('')

  expect(responseListener).toHaveBeenCalledTimes(2)

  // Preflight response.
  {
    const [{ request, response }] = responseListener.mock.calls[0]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)
    expect.soft(response.status).toBe(200)
  }

  {
    const [{ request, response }] = responseListener.mock.calls[1]

    expect.soft(request.method).toBe('POST')
    expect.soft(request.url).toBe(url.href)
    expect.soft(response.status).toBe(101)
  }
})

it('supports mocking non-configurable responses', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    /**
     * @note The Fetch API `Response` will still error on
     * non-configurable status codes. Instead, use this helper class.
     */
    controller.respondWith(new FetchResponse(null, { status: 101 }))
  })

  const responseListener = vi.fn()
  interceptor.on('response', responseListener)

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(101)
  expect.soft(request.response).toBe('')

  expect(responseListener).toHaveBeenCalledTimes(2)

  // Preflight response.
  {
    const [{ request, response }] = responseListener.mock.calls[0]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe('http://any.host.here/irrelevant')
    expect.soft(response.status).toBe(204)
  }

  {
    const [{ request, response }] = responseListener.mock.calls[1]

    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe('http://any.host.here/irrelevant')
    expect.soft(response.status).toBe(101)
  }
})
