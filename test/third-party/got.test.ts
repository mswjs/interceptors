/**
 * @jest-environment node
 */
import got from 'got'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(event) {
    if (event.request.url.toString() === httpServer.http.url('/test')) {
      event.respondWith({
        status: 200,
        body: 'mocked-body',
      })
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/user', (req, res) => {
      return res.status(200).json({ id: 1 })
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
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
