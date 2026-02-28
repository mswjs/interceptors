// @vitest-environment node
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { sleep, toWebResponse } from '#/test/helpers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

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
  interceptor.once('request', async ({ controller }) => {
    await sleep(750)
    controller.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const request = http.get('http://non-existing-host.com')
  const [response] = await toWebResponse(request)
  const requestEnd = Date.now()

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked response')
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
  const [response] = await toWebResponse(request)
  const requestEnd = Date.now()

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})
