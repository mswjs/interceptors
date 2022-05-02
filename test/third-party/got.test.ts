/**
 * @jest-environment node
 */
import got from 'got'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    return res.status(200).json({ id: 1 })
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if (request.url.toString() === httpServer.http.url('/test')) {
    request.respondWith({
      status: 200,
      body: 'mocked-body',
    })
  }
})

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('mocks response to a request made with "got"', async () => {
  const res = await got(httpServer.http.url('/test'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('mocked-body')
})

test('bypasses an unhandled request made with "got"', async () => {
  const res = await got(httpServer.http.url('/user'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual(`{"id":1}`)
})
