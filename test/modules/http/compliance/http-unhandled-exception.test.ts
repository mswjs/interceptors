/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

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

it('handles a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const request = http.get('http://localhost/resource')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(await text()).toBe('hello world')
})

it('treats unhandled interceptor errors as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })

  const request = http.get('http://localhost/resource')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(500)
  expect(res.statusMessage).toBe('Unhandled Exception')
  expect(JSON.parse(await text())).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})
