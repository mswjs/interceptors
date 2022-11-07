/**
 * @jest-environment node
 */
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../src/interceptors/fetch'

const server = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.set('X-Appended-Header', req.headers['x-appended-header']).end()
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  await server.listen()
  interceptor.apply()
})

afterAll(async () => {
  await server.close()
  interceptor.dispose()
})

it('supports modifying outgoing request headers', async () => {
  const context = await pageWith({
    example: require.resolve('./fetch-modify-request.runtime.js'),
  })

  const res = await context.request(server.http.url('/user'))
  const headers = await res.allHeaders()

  expect(headers).toHaveProperty('x-appended-header', 'modified')
})
