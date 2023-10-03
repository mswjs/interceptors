import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('hello world')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('has "complete" equal true on completed passthrough response', async () => {
  const responseEndPromise = new DeferredPromise<http.IncomingMessage>()

  const request = http.get(httpServer.http.url('/resource'))
  request.on('response', (response) => {
    response.on('data', () => {})
    response.on('end', () => responseEndPromise.resolve(response))
  })

  const response = await responseEndPromise
  expect(response.complete).toBe(true)
  expect(response.statusCode).toBe(200)
})

it.only('has "complete" equal true on completed mocked response', async () => {
  interceptor.once('request', ({ request }) => {
    request.respondWith(new Response(null, { status: 204 }))
  })

  const responseEndPromise = new DeferredPromise<http.IncomingMessage>()

  const request = http.get(httpServer.http.url('/resource'))
  request.on('response', (response) => {
    response.on('data', () => {})
    response.on('end', () => responseEndPromise.resolve(response))
  })

  const response = await responseEndPromise
  expect(response.complete).toBe(true)
  expect(response.statusCode).toBe(204)
})
