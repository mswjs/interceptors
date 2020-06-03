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

describe('fetch', () => {
  let requestInterceptor: RequestInterceptor
  const pool: InterceptedRequest[] = []

  beforeAll(() => {
    requestInterceptor = new RequestInterceptor()
    requestInterceptor.use((req) => {
      pool.push(req)
    })
  })

  afterAll(() => {
    requestInterceptor.restore()
  })

  describe('given I perform an HTTP fetch request', () => {
    describe('GET', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('http://httpbin.org/get?userId=123', {
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'http://httpbin.org/get?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'GET')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('POST', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('http://httpbin.org/post?userId=123', {
            method: 'POST',
            headers: {
              'x-custom-header': 'yes',
            },
            body: JSON.stringify({ body: true }),
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'http://httpbin.org/post?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'POST')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access request body', () => {
        expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('PUT', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('http://httpbin.org/put?userId=123', {
            method: 'PUT',
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'http://httpbin.org/put?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'PUT')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('DELETE', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('http://httpbin.org/delete?userId=123', {
            method: 'DELETE',
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'http://httpbin.org/delete?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'DELETE')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })
  })

  /**
   * HTTPS
   */
  describe('given I perform an HTTPS fetch request', () => {
    describe('GET', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('https://httpbin.org/get?userId=123', {
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'https://httpbin.org/get?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'GET')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('POST', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('https://httpbin.org/post?userId=123', {
            method: 'POST',
            headers: {
              'x-custom-header': 'yes',
            },
            body: JSON.stringify({ body: true }),
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'https://httpbin.org/post?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'POST')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access request body', () => {
        expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('PUT', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('https://httpbin.org/put?userId=123', {
            method: 'PUT',
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'https://httpbin.org/put?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'PUT')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })

    describe('DELETE', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareFetch(
          fetch('https://httpbin.org/delete?userId=123', {
            method: 'DELETE',
            headers: {
              'x-custom-header': 'yes',
            },
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request?.url).toBeInstanceOf(URL)
        expect(request?.url.toString()).toEqual(
          'https://httpbin.org/delete?userId=123'
        )
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'DELETE')
      })

      it('should access request query parameters', () => {
        expect(request?.url.searchParams.get('userId')).toEqual('123')
      })

      it('should access default request headers', () => {
        expect(request?.headers).toHaveProperty('accept', ['*/*'])
      })

      it('should access custom request headers', () => {
        expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
      })
    })
  })
})
