// @vitest-environment happy-dom
import {
  RequestController,
  type HttpRequestEventMap,
} from '@mswjs/interceptors'
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

it('emits events for a handled request', async ({ task }) => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET',
          },
        })
      )
    }

    controller.respondWith(
      new Response('mocked response', {
        status: 200,
        statusText: 'OK',
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    )
  })

  const requestListener =
    vi.fn<(event: HttpRequestEventMap['request']) => void>()
  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  const url = server.http.url('/user')
  const request = new XMLHttpRequest()
  request.open('GET', url)
  request.send()

  await waitForXMLHttpRequest(request)

  /**
   * @note Happy DOM issues a CORS preflight OPTIONS request for
   * a cross-origin XMLHttpRequest. The browser does not send a preflight
   * for simple requests.
   */
  const hasPreflight = task.file.projectName !== 'browser'

  expect.soft(requestListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1)

  if (hasPreflight) {
    const [{ request, requestId }] = requestListener.mock.calls[0]

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)
    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  {
    const [{ request, requestId }] =
      requestListener.mock.calls[hasPreflight ? 1 : 0]

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe(url.href)
    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1)

  if (hasPreflight) {
    // Preflight response.
    const [{ response, request, requestId }] = responseListener.mock.calls[0]

    expect.soft(response).toBeInstanceOf(Response)
    expect.soft(response.status).toBe(200)
    expect.soft(response.body).toBeNull()

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)

    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  // Mocked response.
  {
    const [{ response, request, requestId }] =
      responseListener.mock.calls[hasPreflight ? 1 : 0]

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain;charset=UTF-8'
    )
    expect(response.bodyUsed).toBe(false)
    await expect(response.text()).resolves.toBe('mocked response')

    expect(request).toBeInstanceOf(Request)
    expect(request.method).toBe('GET')
    expect(request.url).toBe(url.href)

    expect(requestId).toMatch(/^\w{9,}$/)
  }
})

it('emits events for a bypassed request', async ({ task }) => {
  const requestListener =
    vi.fn<(event: HttpRequestEventMap['request']) => void>()
  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  const url = server.http.url('/bypassed')
  const request = new XMLHttpRequest()
  request.open('GET', url)
  request.send()

  await waitForXMLHttpRequest(request)

  const hasPreflight = task.file.projectName !== 'browser'

  expect(requestListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1)

  if (hasPreflight) {
    // Preflight request.
    const [{ request, controller, requestId }] = requestListener.mock.calls[0]

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)
    expect.soft(controller).toBeInstanceOf(RequestController)
    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  {
    const [{ request, controller, requestId }] =
      requestListener.mock.calls[hasPreflight ? 1 : 0]

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe(url.href)
    expect.soft(controller).toBeInstanceOf(RequestController)
    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  expect(responseListener).toHaveBeenCalledTimes(hasPreflight ? 2 : 1)

  if (hasPreflight) {
    // Preflight response.
    const [{ response, request, requestId }] = responseListener.mock.calls[0]

    expect.soft(response).toBeInstanceOf(Response)
    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('')

    expect.soft(request).toBeInstanceOf(Request)
    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)

    expect.soft(requestId).toMatch(/^\w{9,}$/)
  }

  {
    const [responseParams] =
      responseListener.mock.calls[hasPreflight ? 1 : 0]

    expect.soft(responseParams.response).toBeInstanceOf(Response)
    expect.soft(responseParams.response.status).toBe(200)
    expect.soft(responseParams.response.statusText).toBe('OK')
    expect
      .soft(responseParams.response.headers.get('Content-Type'))
      .toBe('text/plain; charset=utf-8')
    expect.soft(responseParams.response.bodyUsed).toBe(false)
    await expect
      .soft(responseParams.response.text())
      .resolves.toBe('original-response')

    // Response listener must provide a relevant request.
    expect.soft(responseParams.request).toBeInstanceOf(Request)
    expect.soft(responseParams.request.method).toBe('GET')
    expect.soft(responseParams.request.url).toBe(url.href)

    // The last argument of the response listener is the request ID.
    expect.soft(responseParams.requestId).toMatch(/^\w{9,}$/)
  }
})
