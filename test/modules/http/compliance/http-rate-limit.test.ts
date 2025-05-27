// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import rateLimit from 'express-rate-limit'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.use(
    // @ts-expect-error Old express type definitions.
    rateLimit({
      limit: 5,
      windowMs: 100,
      handler(request, response, next, options) {
        // @ts-expect-error
        if (request.rateLimit.used === request.rateLimit.limit + 1) {
          console.warn('RATE LIMIT REACHED!')
          return handleLimitReached()
        }
        response.status(options.statusCode).send(options.message)
      },
    })
  )

  app.get('/', (req, res) => {
    res.send('ok')
  })
})

const interceptor = new ClientRequestInterceptor()
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
  await httpServer.listen()
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
        const req = http.get(httpServer.http.url('/?mock=true'))
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
        const req = http.get(httpServer.http.url('/'))
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
