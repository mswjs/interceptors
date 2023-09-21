import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { sleep, waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports custom delay before responding with a mock', async () => {
  interceptor.once('request', async ({ request }) => {
    await sleep(750)
    request.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const request = http.get('https://non-existing-host.com')
  const { res, text } = await waitForClientRequest(request)
  const requestEnd = Date.now()

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('mocked response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})

it('supports custom delay before receiving the original response', async () => {
  interceptor.once('request', async () => {
    // This will simply delay the request execution before
    // it receives the original response.
    await sleep(750)
  })

  const requestStart = Date.now()
  const request = http.get(httpServer.http.url('/resource'))
  const { res, text } = await waitForClientRequest(request)
  const requestEnd = Date.now()

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('original response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})
