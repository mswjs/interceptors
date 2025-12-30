// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('ok')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

/**
 * When no request listeners are registered, the interceptor should call
 * passthrough() immediately without going through the full async machinery.
 * This prevents timing issues with high-concurrency requests.
 * @see https://github.com/mswjs/interceptors/issues/760
 */
it('performs passthrough when no request listeners are attached', async () => {
  const request = http.request(httpServer.http.url('/resource'))
  request.end()
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('ok')
})

it('handles concurrent requests when no listeners are attached', async () => {
  const requests = Array.from({ length: 20 }, () => {
    const req = http.request(httpServer.http.url('/resource'))
    req.end()
    return waitForClientRequest(req)
  })

  const results = await Promise.all(requests)

  for (const { res, text } of results) {
    expect(res.statusCode).toBe(200)
    expect(await text()).toBe('ok')
  }
})
