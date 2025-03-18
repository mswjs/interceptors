// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { https } from 'follow-redirects'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../helpers'

const interceptor = new ClientRequestInterceptor()

const server = new HttpServer((app) => {
  app.post('/resource', (req, res) => {
    /**
     * @note Respond with the 307 status code so the redirect
     * request would use the same method as the original request.
     * @see https://github.com/follow-redirects/follow-redirects/issues/121
     */
    res.status(307).set('Location', server.https.url('/user')).end()
  })

  app.post('/user', (req, res) => {
    res.status(200).send('hello from the server')
  })

  app.get('/original', (req, res) => {
    res.writeHead(307, { Location: server.https.url('/redirected') })
  })

  app.get('/redirected', (req, res) => {
    res.status(200).send('redirected response')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
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

  const { address } = server.https
  const payload = JSON.stringify({ todo: 'Buy the milk' })

  const catchResponseUrl = vi.fn()
  const request = https.request(
    {
      method: 'POST',
      hostname: address.host,
      port: address.port,
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

  const { text } = await waitForClientRequest(request as any)

  await vi.waitFor(() => {
    expect(requestListener).toHaveBeenCalledTimes(2)
  })

  // Intercepted initial request.
  const [initialRequest] = requestListener.mock.calls[0]

  expect(initialRequest.method).toBe('POST')
  expect(initialRequest.url).toBe(server.https.url('/resource'))
  expect(initialRequest.credentials).toBe('same-origin')
  expect(initialRequest.headers.get('Content-Type')).toBe('application/json')
  expect(initialRequest.headers.get('Content-Length')).toBe('23')
  expect(await initialRequest.json()).toEqual({ todo: 'Buy the milk' })

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[1]

  expect(redirectedRequest.method).toBe('POST')
  expect(redirectedRequest.url).toBe(server.https.url('/user'))
  expect(redirectedRequest.credentials).toBe('same-origin')
  expect(redirectedRequest.headers.get('Content-Type')).toBe('application/json')
  expect(redirectedRequest.headers.get('Content-Length')).toBe('23')
  expect(await redirectedRequest.json()).toEqual({ todo: 'Buy the milk' })

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(server.https.url('/user'))
  expect(await text()).toBe('hello from the server')
})

it('supports mocking a redirect response to the original response', async () => {
  const requestListener = vi.fn<(request: Request) => void>()

  interceptor.once('request', ({ request, controller }) => {
    requestListener(request)

    if (request.url.endsWith('/original')) {
      controller.respondWith(
        Response.redirect(server.https.url('/redirected'), 307)
      )
    }
  })

  const catchResponseUrl = vi.fn()
  const request = https.request(
    {
      method: 'GET',
      hostname: server.https.address.host,
      port: server.https.address.port,
      path: '/original',
      rejectUnauthorized: false,
    },
    (res) => {
      catchResponseUrl(res.responseUrl)
    }
  )

  request.end()

  const { text } = await waitForClientRequest(request as any)

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[0]

  expect(redirectedRequest.method).toBe('GET')
  expect(redirectedRequest.url).toBe(server.https.url('/original'))

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(server.https.url('/redirected'))
  expect(await text()).toBe('redirected response')
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
      hostname: server.https.address.host,
      port: server.https.address.port,
      path: '/original',
      rejectUnauthorized: false,
    },

    (res) => {
      catchResponseUrl(res.responseUrl)
    }
  )

  request.end()

  const { text } = await waitForClientRequest(request as any)

  // Intercepted redirect request (issued by "follow-redirects").
  const [redirectedRequest] = requestListener.mock.calls[0]

  expect(redirectedRequest.method).toBe('GET')
  expect(redirectedRequest.url).toBe(server.https.url('/original'))

  // Response (original).
  expect(catchResponseUrl).toHaveBeenCalledWith(
    'https://localhost:3000/redirected'
  )
  expect(await text()).toBe('mocked response')
})
