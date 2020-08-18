/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../src'
import { httpGet, httpRequest } from '../helpers'
import withDefaultInterceptors from '../../src/presets/default'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    if (['http://httpbin.org/'].includes(req.url.href)) {
      return {
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }

    if (req.url.href === 'http://error.me/') {
      throw new Error('Custom exception message')
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('responds to an HTTP request issued by "http.request" and handled in the middleware', async () => {
  const { res, resBody } = await httpRequest('http://httpbin.org')

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTP request issued by "http.request" not handled in the middleware', async () => {
  const { res, resBody } = await httpRequest('http://httpbin.org/get')

  expect(res.statusCode).toBe(200)
  expect(resBody).toContain(`\"url\": \"http://httpbin.org/get\"`)
})

test('responds to an HTTP request issued by "http.get" and handled in the  middleeware', async () => {
  const { res, resBody } = await httpRequest('http://httpbin.org')

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTP request issued by "http.get" not handled in the middleware', async () => {
  const { res, resBody } = await httpGet('http://httpbin.org/get')

  expect(res.statusCode).toBe(200)
  expect(resBody).toContain(`\"url\": \"http://httpbin.org/get\"`)
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => httpGet('http://error.me')
  await expect(getResponse()).rejects.toThrow('Custom exception message')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const { res } = await httpGet('http://httpbin.org')

  expect(res.statusCode).toBe(200)
})
