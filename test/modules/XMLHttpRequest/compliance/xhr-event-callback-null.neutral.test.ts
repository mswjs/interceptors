// @vitest-environment happy-dom
/**
 * @see https://xhr.spec.whatwg.org/#event-handlers
 */
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

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => server.https.url('/').href],
  ['mocked', () => 'http://localhost/resource'],
])(
  `does not fail when unsetting event handlers for a successful %s response`,
  async (_, getUrl) => {
    interceptor.on('request', ({ request, controller }) => {
      if (request.method === 'OPTIONS') {
        return controller.respondWith(
          new Response(null, {
            status: 204,
            headers: { 'access-control-allow-origin': '*' },
          })
        )
      }

      controller.respondWith(new Response('hello'))
    })
    const url = getUrl()

    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send('hello')

    await waitForXMLHttpRequest(request)

    expect.soft(request.readyState).toBe(4)
    expect.soft(request.status).toBe(200)
    expect.soft(request.responseText).toBe('hello')
  }
)

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => server.https.url('/server-error').href],
  ['mocked', () => 'http://localhost/error-response'],
])(
  `does not fail when unsetting event handlers for a %s error response`,
  async (_, getUrl) => {
    interceptor.on('request', ({ request, controller }) => {
      if (request.method === 'OPTIONS') {
        return controller.respondWith(
          new Response(null, {
            status: 204,
            headers: { 'access-control-allow-origin': '*' },
          })
        )
      }

      controller.respondWith(
        new Response('Internal Server Error', { status: 500 })
      )
    })
    const url = getUrl()

    const request = new XMLHttpRequest()
    request.open('GET', url)
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()

    await waitForXMLHttpRequest(request)

    expect.soft(request.readyState).toBe(4)
    expect.soft(request.status).toBe(500)
    expect.soft(request.responseText).toBe('Internal Server Error')
  }
)

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => server.https.url('/network-error').href],
  ['mocked', () => 'http://localhost/network-error'],
])(
  `does not fail when unsetting event handlers for a %s request error`,
  async (_, getUrl) => {
    interceptor.on('request', ({ request, controller }) => {
      if (request.method === 'OPTIONS') {
        return controller.respondWith(
          new Response(null, {
            status: 204,
            headers: { 'access-control-allow-origin': '*' },
          })
        )
      }

      controller.respondWith(Response.error())
    })
    const url = getUrl()

    const request = new XMLHttpRequest()
    request.open('GET', url)
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()

    await waitForXMLHttpRequest(request)

    expect.soft(request.readyState).toBe(4)
    expect.soft(request.status).toBe(0)
    expect.soft(request.responseText).toBe('')
  }
)

it('does not fail when unsetting event handlers during unhandled exception in the interceptor', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    throw new Error('Custom error')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', server.https.url('/network-error'))
  request.onreadystatechange = null
  request.onloadstart = null
  request.onprogress = null
  request.onload = null
  request.onloadend = null
  request.ontimeout = null
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.readyState).toBe(4)
  expect.soft(request.status).toBe(500)
  expect.soft(request.statusText).toBe('Unhandled Exception')
  expect.soft(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})
