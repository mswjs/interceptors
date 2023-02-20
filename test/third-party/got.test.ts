import { it, expect, beforeAll, afterAll } from 'vitest'
import got from 'got'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { Response } from '@remix-run/web-fetch'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    return res.status(200).json({ id: 1 })
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
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
  expect(res.body).toEqual(`{"id":1}`)
})
