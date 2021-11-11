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
  resolver(request) {
    if (request.url.toString() === httpServer.http.makeUrl('/test')) {
      return {
        status: 200,
        body: 'mocked-body',
      }
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
  const res = await got(httpServer.http.makeUrl('/test'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('mocked-body')
})

test('bypasses an unhandled request made with "got"', async () => {
  const res = await got(httpServer.http.makeUrl('/user'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual(`{"id":1}`)
})
