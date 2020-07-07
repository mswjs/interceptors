/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../src'
import { httpsGet, httpsRequest } from '../helpers'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor()
  interceptor.use((req) => {
    if (['https://test.mswjs.io'].includes(req.url.origin)) {
      return {
        status: 301,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }

    if (req.url.href === 'https://error.me/') {
      throw new Error('Custom exception message')
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('responds to an HTTPS request issued by "https.request" and handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest('https://test.mswjs.io')

  expect(res.statusCode).toEqual(301)
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.request" not handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest('https://httpbin.org/get')

  expect(res.statusCode).toEqual(200)
  expect(resBody).toContain(`\"url\": \"https://httpbin.org/get\"`)
})

test('responds to an HTTPS request issued by "https.get" and handled in the middleware', async () => {
  const { res, resBody } = await httpsGet('https://test.mswjs.io')

  expect(res.statusCode).toEqual(301)
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.get" not handled in the middleware', async () => {
  const { res, resBody } = await httpsGet('https://httpbin.org/get')

  expect(res.statusCode).toEqual(200)
  expect(resBody).toContain(`\"url\": \"https://httpbin.org/get\"`)
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => httpsGet('https://error.me')
  await expect(getResponse()).rejects.toThrow('Custom exception message')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const { res } = await httpsGet('https://test.mswjs.io')

  expect(res.statusCode).toBe(404)
})
