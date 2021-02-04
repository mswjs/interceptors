/**
 * @jest-environment node
 */
import got from 'got'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let server: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    if (request.url.toString() === server.http.makeUrl('/test')) {
      return {
        status: 200,
        body: 'mocked-body',
      }
    }
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/user', (req, res) => {
      return res.status(200).json({ id: 1 })
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('mocks response to a request made with "got"', async () => {
  const res = await got(server.http.makeUrl('/test'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('mocked-body')
})

test('bypasses an unhandled request made with "got"', async () => {
  const res = await got(server.http.makeUrl('/user'))

  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual(`{"id":1}`)
})
