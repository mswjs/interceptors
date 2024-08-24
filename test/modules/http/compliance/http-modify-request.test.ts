/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const server = new HttpServer((app) => {
  app.use('/user', (req, res) => {
    res.set('x-appended-header', req.headers['x-appended-header']).end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await server.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  await server.close()
  interceptor.dispose()
})

it('allows modifying the outgoing request headers', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.get(server.http.url('/user'))
  const { res } = await waitForClientRequest(request)

  expect(res.headers['x-appended-header']).toBe('modified')
})

it('allows modifying the outgoing request headers in a request with body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.request(server.http.url('/user'), { method: 'POST' })
  request.write('post-payload')
  request.end()

  const { res } = await waitForClientRequest(request)

  expect(res.headers['x-appended-header']).toBe('modified')
})
