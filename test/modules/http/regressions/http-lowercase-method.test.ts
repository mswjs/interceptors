/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('Lowercased get method should work', async () => {
  const request = http.request('http://example.com', { method: 'get' }).end()
  const { res } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
})

