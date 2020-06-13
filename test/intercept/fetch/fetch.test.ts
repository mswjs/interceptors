/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import { fetch, findRequest } from '../../helpers'

async function prepareFetch(
  executedFetch: ReturnType<typeof fetch>,
  pool: InterceptedRequest[]
) {
  return executedFetch.then(({ url, init }) => {
    return findRequest(pool, init?.method || 'GET', url)
  })
}

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []

beforeAll(() => {
  requestInterceptor = new RequestInterceptor()
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

test('intercepts an HTTP GET request', async () => {
  const request = await prepareFetch(
    fetch('http://httpbin.org/get?userId=123', {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('http://httpbin.org/get?userId=123')
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
})

test('intercepts an HTTP POST request', async () => {
  const request = await prepareFetch(
    fetch('http://httpbin.org/post?userId=123', {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: true }),
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('http://httpbin.org/post?userId=123')
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
})

test('intercepts an HTTP PUT request', async () => {
  const request = await prepareFetch(
    fetch('http://httpbin.org/put?userId=123', {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('http://httpbin.org/put?userId=123')
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
})

test('intercepts an HTTP DELETE request', async () => {
  const request = await prepareFetch(
    fetch('http://httpbin.org/delete?userId=123', {
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
    'http://httpbin.org/delete?userId=123'
  )
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepareFetch(
    fetch('https://httpbin.org/get?userId=123', {
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
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
})

test('intercepts an HTTPS POST request', async () => {
  const request = await prepareFetch(
    fetch('https://httpbin.org/post?userId=123', {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: true }),
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/post?userId=123')
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
})

test('intercepts an HTTPS PUT request', async () => {
  const request = await prepareFetch(
    fetch('https://httpbin.org/put?userId=123', {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/put?userId=123')
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('userId')).toEqual('123')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepareFetch(
    fetch('https://httpbin.org/delete?userId=123', {
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
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
})
