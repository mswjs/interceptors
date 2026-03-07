// @vitest-environment node
import http from 'node:http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

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

  const [response] = await toWebResponse(request)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('Mocked')
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

  const [response] = await toWebResponse(request)

  expect(errorListener).not.toHaveBeenCalled()
  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(request.path).toBe('/')
  expect(request.method).toBe('GET')
  expect(request.protocol).toBe('http:')
  expect(request.host).toBe('localhost')
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('Mocked')
})
