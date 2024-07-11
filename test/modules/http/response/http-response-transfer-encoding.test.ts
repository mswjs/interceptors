// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds with a mocked "transfer-encoding: chunked" response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock', {
        headers: { 'Transfer-Encoding': 'chunked' },
      })
    )
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers).toHaveProperty('transfer-encoding', 'chunked')
  expect(res.rawHeaders).toContain('Transfer-Encoding')
  expect(await text()).toBe('mock')
})
