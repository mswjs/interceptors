// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { waitForClientRequest } from '../../../helpers'

const server = new HttpServer((app) => {
  app.use('/user', (req, res) => {
    const header = req.headers['x-appended-header']

    if (header) {
      res.set('x-appended-header', header)
    }

    res.end()
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it('allows modifying the outgoing headers for a request without a body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.get(server.http.url('/user'))
  const { res } = await waitForClientRequest(request)

  expect(res.headers['x-appended-header']).toBe('modified')
})

it('allows modifying the outgoing headers for a request with a body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.request(server.http.url('/user'))
  request.write('hello')
  request.end(' world')

  const { res } = await waitForClientRequest(request)

  expect(res.headers['x-appended-header']).toBe('modified')
})

it('allows modifying the outgoing request headers in a request with a body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.request(server.http.url('/user'), { method: 'POST' })
  request.write('post-payload')
  request.end()

  const { res } = await waitForClientRequest(request)

  expect(res.headers['x-appended-header']).toBe('modified')
})
