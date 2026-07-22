// @vitest-environment node
import { https } from 'follow-redirects'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

let server: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  server = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.post('/resource', () => {
        /**
         * @note Respond with the 307 status code so the redirect
         * request would use the same method as the original request.
         * @see https://github.com/follow-redirects/follow-redirects/issues/121
         */
        return new Response(null, {
          status: 307,
          headers: {
            Location: server.https.url('/user').href,
          },
        })
      })

      router.post('/user', () => {
        return new Response('hello from the server')
      })

      router.get('/original', () => {
        return new Response(null, {
          status: 307,
          headers: {
            Location: server.https.url('/redirected').href,
          },
        })
      })

      router.get('/redirected', () => {
        return new Response('redirected response')
      })
    },
  })
})

afterEach(() => {
  vi.resetAllMocks()
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it('intercepts a request issued by "follow-redirects"', async () => {
  const requestListener = vi.fn<(request: Request) => void>()
  interceptor.on('request', ({ request }) => requestListener(request))

  const payload = JSON.stringify({ todo: 'Buy the milk' })

  const catchResponseUrl = vi.fn()
  const request = https.request(
    {
      method: 'POST',
      hostname: server.https.url().hostname,
      port: server.https.url().port,
      path: '/resource',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.from(payload).byteLength,
      },
      rejectUnauthorized: false,
    },
    (res) => {
      catchResponseUrl(res.responseUrl)
    }
  )

  request.end(payload)

  const [response] = await toWebResponse(request as any)

  await vi.waitFor(() => {
    expect(requestListener).toHaveBeenCalledTimes(2)
  })

  // Intercepted initial request.
  const [initialRequest] = requestListener.mock.calls[0]

  expect(initialRequest.method).toBe('POST')
  expect(initialRequest.url).toBe(server.https.url('/resource').href)
  expect(initialRequest.credentials).toBe('same-origin')
  expect(initialRequest.headers.get('Content-Type')).toBe('application/json')
  expect(initialRequest.headers.get('Content-Length')).toBe('23')
  expect(await initialRequest.json()).toEqual({ todo: 'Buy the milk' })

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[1]

  expect(redirectedRequest.method).toBe('POST')
  expect(redirectedRequest.url).toBe(server.https.url('/user').href)
  expect(redirectedRequest.credentials).toBe('same-origin')
  expect(redirectedRequest.headers.get('Content-Type')).toBe('application/json')
  expect(redirectedRequest.headers.get('Content-Length')).toBe('23')
  expect(await redirectedRequest.json()).toEqual({ todo: 'Buy the milk' })

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(server.https.url('/user').href)
  await expect(response.text()).resolves.toBe('hello from the server')
})

it('supports mocking a redirect response to the original response', async () => {
  const requestListener = vi.fn<(request: Request) => void>()

  interceptor.once('request', ({ request, controller }) => {
    requestListener(request)

    if (request.url.endsWith('/original')) {
      controller.respondWith(
        Response.redirect(server.https.url('/redirected').href, 307)
      )
    }
  })

  const catchResponseUrl = vi.fn()
  const request = https.request(
    {
      method: 'GET',
      hostname: server.https.url().hostname,
      port: server.https.url().port,
      path: '/original',
      rejectUnauthorized: false,
    },
    (res) => {
      catchResponseUrl(res.responseUrl)
    }
  )

  request.end()

  const [response] = await toWebResponse(request as any)

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[0]

  expect(redirectedRequest.method).toBe('GET')
  expect(redirectedRequest.url).toBe(server.https.url('/original').href)

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(
    server.https.url('/redirected').href
  )
  await expect(response.text()).resolves.toBe('redirected response')
})

it('supports mocking a redirect response to a mocked response', async () => {
  const requestListener = vi.fn<(request: Request) => void>()

  interceptor.on('request', ({ request, controller }) => {
    requestListener(request)

    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('https://localhost:3000/redirected', 307)
      )
    }

    if (request.url.endsWith('/redirected')) {
      return controller.respondWith(new Response('mocked response'))
    }
  })

  const catchResponseUrl = vi.fn()
  const request = https.request(
    {
      method: 'GET',
      hostname: server.https.url().hostname,
      port: server.https.url().port,
      path: '/original',
      rejectUnauthorized: false,
    },

    (res) => {
      catchResponseUrl(res.responseUrl)
    }
  )

  request.end()

  const [response] = await toWebResponse(request as any)

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[0]

  expect(redirectedRequest.method).toBe('GET')
  expect(redirectedRequest.url).toBe(server.https.url('/original').href)

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(
    'https://localhost:3000/redirected'
  )
  await expect(response.text()).resolves.toBe('mocked response')
})
