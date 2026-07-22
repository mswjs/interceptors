// @vitest-environment node
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (!url.searchParams.has('mock')) {
    return
  }

  controller.respondWith(
    new Response('mocked-body', { status: 403, statusText: 'Forbidden' })
  )
})

const handleLimitReached = vi.fn()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      // A hand-rolled rate limiter: allow 5 requests per 100ms window,
      // then respond with 429 (mirrors the previous "express-rate-limit" setup).
      const rateLimitWindowMs = 100
      const rateLimitMax = 5
      let requestsInWindow = 0
      let windowStartedAt = Date.now()

      /**
       * @note Serve a dedicated path: the test server registers its own
       * "GET /" route before these routes, and route registration order
       * wins in Hono, so the root path cannot be overridden.
       */
      router.get('/resource', () => {
        const now = Date.now()

        if (now - windowStartedAt > rateLimitWindowMs) {
          windowStartedAt = now
          requestsInWindow = 0
        }

        requestsInWindow += 1

        if (requestsInWindow > rateLimitMax) {
          if (requestsInWindow === rateLimitMax + 1) {
            console.warn('RATE LIMIT REACHED!')
            handleLimitReached()
          }

          return new Response('Too many requests, please try again later.', {
            status: 429,
          })
        }

        return new Response('ok')
      })
    },
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not reach the rate preforming more mocked requests than allowed', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform more requests than allowed by rate limiting.
  for (let i = 0; i < 100; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.url('/resource?mock=true').href)
        req.on('abort', reject)
        req.on('error', reject)
        req.on('response', resolve)
      })
    )
  }

  const responses = await Promise.all(requests)
  const statusCodes = responses.map((res) => res.statusCode)

  expect(statusCodes).not.toEqual(expect.arrayContaining([429]))
  expect(handleLimitReached).not.toHaveBeenCalled()
})

it('does not reach the rate limiting performing allowed number of bypassed requests', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform allowed number of requests according to rate limiting.
  for (let i = 0; i < 5; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.url('/resource').href)
        req.on('abort', reject)
        req.on('error', reject)
        req.on('response', resolve)
      })
    )
  }

  const responses = await Promise.all(requests)
  const statusCodes = responses.map((res) => res.statusCode)

  expect(statusCodes).not.toEqual(expect.arrayContaining([429]))
  expect(handleLimitReached).not.toHaveBeenCalled()
})
