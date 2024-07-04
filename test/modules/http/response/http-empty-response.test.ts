/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports responding with an empty mocked response', async () => {
  interceptor.once('request', ({ request }) => {
    // Responding with an empty response must
    // translate to 200 OK with an empty body.
    request.respondWith(new Response())
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('')
})
