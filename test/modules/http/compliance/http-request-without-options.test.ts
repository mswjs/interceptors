/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  if (request.url === 'http://localhost/') {
    controller.respondWith(new Response('Mocked'))
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports "http.request()" without any arguments', async () => {
  const responseListener = vi.fn()
  const errorListener = vi.fn()

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .request()
  request.end()
  request.on('response', responseListener)
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
})

it('supports "http.get()" without any arguments', async () => {
  const responseListener = vi.fn()
  const errorListener = vi.fn()

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .get()
    .end()
  request.on('response', responseListener)
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
})
