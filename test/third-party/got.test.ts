import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
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

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('mocks response to a request made with "got"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const response = await got(httpServer.http.url('/test'))

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe('mocked-body')
})

it('bypasses an unhandled request made with "got"', async () => {
  const response = await got(httpServer.http.url('/user'))

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe(`{"id":1}`)
})

it('supports timeout before resolving request as-is', async () => {
  interceptor.on('request', async ({ controller }) => {
    await sleep(750)
    controller.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const response = await got('https://intentionally-non-existing-host.com')
  const requestEnd = Date.now()

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe('mocked response')
  expect.soft(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})

it('supports responding with a 204 mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 204,
        headers: {
          'content-type': 'application/dicom+json',
        },
      })
    )
  })

  const client = got.extend({
    prefixUrl: 'http://localhost:3000/path',
    headers: {
      authorization: 'Bearer fake-token',
      accept: 'application/dicom+json',
    },
    responseType: 'json',
    retry: { limit: 0 },
  })

  const response = await client.get('studies')
  expect.soft(response.statusCode).toBe(204)
  expect
    .soft(response.headers)
    .toHaveProperty('content-type', 'application/dicom+json')
  expect.soft(response.body).toBe('')
})
