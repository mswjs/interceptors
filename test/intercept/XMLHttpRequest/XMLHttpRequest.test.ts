import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import { xhr, findRequest } from '../../helpers'

function prepareXHR(
  res: ReturnType<typeof xhr>,
  pool: InterceptedRequest[]
): Promise<InterceptedRequest | undefined> {
  return res.then(({ url, method }) => {
    return findRequest(pool, method, url)
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
  const request = await prepareXHR(
    xhr('GET', 'http://httpbin.org/get?userId=123', {
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
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP POST request', async () => {
  const request = await prepareXHR(
    xhr('POST', 'http://httpbin.org/post?userId=123', {
      body: 'request-body',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('http://httpbin.org/post?userId=123')
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PUT request', async () => {
  const request = await prepareXHR(
    xhr('PUT', 'http://httpbin.org/put?userId=123', {
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
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP DELETE request', async () => {
  const request = await prepareXHR(
    xhr('DELETE', 'http://httpbin.org/delete?userId=123', {
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
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PATCH request', async () => {
  const request = await prepareXHR(
    xhr('PATCH', 'http://httpbin.org/patch?userId=123', {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('http://httpbin.org/patch?userId=123')
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepareXHR(
    xhr('GET', 'https://httpbin.org/get?userId=123', {
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
  const request = await prepareXHR(
    xhr('POST', 'https://httpbin.org/post?userId=123', {
      body: 'request-body',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
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
  const request = await prepareXHR(
    xhr('PUT', 'https://httpbin.org/put?userId=123', {
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
  expect(request?.url.searchParams.get('userId')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepareXHR(
    xhr('DELETE', 'https://httpbin.org/delete?userId=123', {
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

  const request = await prepareXHR(
    xhr('PATCH', 'https://httpbin.org/patch?userId=123', {
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
