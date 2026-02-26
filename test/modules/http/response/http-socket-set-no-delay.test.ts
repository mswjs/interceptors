// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports mocking a request with the socket "noDelay" set to true', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = http.get('http://any.host.here/api')
  request.on('socket', (socket) => {
    socket.setNoDelay(true)
  })
  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('hello world')
})
