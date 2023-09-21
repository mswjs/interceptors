import { it, expect, beforeAll, afterAll } from 'vitest'
import got from 'got'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { sleep } from '../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    return res.status(200).json({ id: 1 })
  })
})

const interceptor = new ClientRequestInterceptor()

interceptor.on('request', function rootListener({ request }) {
  if (request.url.toString() === httpServer.http.url('/test')) {
    request.respondWith(new Response('mocked-body'))
  }
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('mocks response to a request made with "got"', async () => {
  const res = await got(httpServer.http.url('/test'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('mocked-body')
})

it('bypasses an unhandled request made with "got"', async () => {
  const res = await got(httpServer.http.url('/user'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe(`{"id":1}`)
})

it('supports timeout before resolving request as-is', async () => {
  interceptor.once('request', async ({ request }) => {
    await sleep(750)
    request.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const res = await got('https://intentionally-non-existing-host.com')
  const requestEnd = Date.now()

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('mocked response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})
