/**
 * @jest-environment node
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const server = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.set('x-appended-header', req.headers['x-appended-header']).end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await server.listen()
  interceptor.apply()
})

afterAll(async () => {
  await server.close()
  interceptor.dispose()
})

it('allows modifying the outgoing request headers', async () => {
  interceptor.on('request', (request) => {
    request.headers.set('X-Appended-Header', 'modified')
  })

  const req = http.get(server.http.url('/user'))
  const { text, res } = await waitForClientRequest(req)

  expect(res.headers['x-appended-header']).toBe('modified')
})
