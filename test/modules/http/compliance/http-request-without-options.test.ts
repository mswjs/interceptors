import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports "http.request()" without any options', async () => {
  const responseListener = vi.fn()
  const errorListener = vi.fn()

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .request()
  request.end()
  request.on('response', responseListener)
  request.on('error', errorListener)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).not.toHaveBeenCalled()
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
})

it('responds with a mocked response for "http.request()" without any options', async () => {
  interceptor.once('request', ({ request }) => {
    if (request.url === 'http://localhost/') {
      request.respondWith(new Response('Mocked'))
    }
  })

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .request()
  request.end()

  const errorListener = vi.fn()
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(errorListener).not.toHaveBeenCalled()

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
})

it('supports "http.get()" without any argumenst', async () => {
  const responseListener = vi.fn()
  const errorListener = vi.fn()

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .get()
  request.end()
  request.on('response', responseListener)
  request.on('error', errorListener)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).not.toHaveBeenCalled()
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
})

it('responds with a mocked response for "http.get()" without any options', async () => {
  interceptor.once('request', ({ request }) => {
    if (request.url === 'http://localhost/') {
      request.respondWith(new Response('Mocked'))
    }
  })

  const request = http
    // @ts-ignore It's possible to make a request without any options.
    // This will result in a "GET http://localhost" request in Node.js.
    .get()
  request.end()

  const errorListener = vi.fn()
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(errorListener).not.toHaveBeenCalled()

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
})
