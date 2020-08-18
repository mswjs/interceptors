/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsRequest } from '../../helpers'

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []

beforeAll(() => {
  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(() => {
  requestInterceptor.restore()
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepare(
    httpsRequest('https://httpbin.org/get?userId=123', {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/get?userId=123')
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS POST request', async () => {
  const request = await prepare(
    httpsRequest(
      'https://httpbin.org/post?userId=123',
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
      },
      'request-body'
    ),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/post?userId=123')
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PUT request', async () => {
  const request = await prepare(
    httpsRequest(
      'https://httpbin.org/put?userId=123',
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
      },
      'request-body'
    ),
    pool
  )
  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/put?userId=123')
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepare(
    httpsRequest('https://httpbin.org/delete?userId=123', {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(
    'https://httpbin.org/delete?userId=123'
  )
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PATCH request', async () => {
  const request = await prepare(
    httpsRequest('https://httpbin.org/patch?userId=123', {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(
    'https://httpbin.org/patch?userId=123'
  )
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})
