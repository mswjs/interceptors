// @vitest-environment node
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'

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

it('supports responding with an empty mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    // Responding with an empty response must
    // translate to 200 OK with an empty body.
    controller.respondWith(new Response())
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers).toEqual({})
  expect.soft(res.rawHeaders).toEqual([])
  await expect.soft(text()).resolves.toBe('')
})
