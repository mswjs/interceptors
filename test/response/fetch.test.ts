/**
 * @jest-environment node
 */
import fetch, { Response } from 'node-fetch'
import { RequestInterceptor } from '../../src'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor()
  interceptor.use((req) => {
    if (
      ['https://api.github.com', 'http://api.github.com'].includes(
        req.url.origin
      )
    ) {
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('responds to an HTTP request that is handled in the middleware', async () => {
  const res = await fetch('http://api.github.com')
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(body).toEqual({
    mocked: true,
  })
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await fetch('http://httpbin.org/get')
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toHaveProperty('url', 'http://httpbin.org/get')
})

test('responds to an HTTPS request that is handled in the middleware', async () => {
  const res = await fetch('https://api.github.com')
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(body).toEqual({
    mocked: true,
  })
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await fetch('https://httpbin.org/get')
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toHaveProperty('url', 'https://httpbin.org/get')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const httpRes = await fetch('http://httpbin.org/get')
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(200)
  expect(httpBody).toHaveProperty('url', 'http://httpbin.org/get')

  const httpsRes = await fetch('https://httpbin.org/get')
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(200)
  expect(httpsBody).toHaveProperty('url', 'https://httpbin.org/get')
})
