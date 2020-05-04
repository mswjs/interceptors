/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsRequest } from '../../helpers'

describe('https.request', () => {
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

  describe('given I perform a request using http.request', () => {
    describe('GET', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepare(
          httpsRequest('https://httpbin.org/get?userId=123'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'https://httpbin.org/get')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'GET')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })
    })

    describe('POST', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepare(
          httpsRequest(
            'https://httpbin.org/post?userId=123',
            { method: 'POST' },
            'request-body'
          ),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'https://httpbin.org/post')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'POST')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })

      it('should access request body', () => {
        expect(request).toHaveProperty('body', 'request-body')
      })
    })

    describe('PUT', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepare(
          httpsRequest(
            'https://httpbin.org/put?userId=123',
            { method: 'PUT' },
            'request-body'
          ),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'https://httpbin.org/put')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'PUT')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })

      it('should access request body', () => {
        expect(request).toHaveProperty('body', 'request-body')
      })
    })

    describe('DELETE', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepare(
          httpsRequest('https://httpbin.org/delete?userId=123', {
            method: 'DELETE',
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'https://httpbin.org/delete')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'DELETE')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })
    })

    describe('PATCH', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepare(
          httpsRequest('https://httpbin.org/patch?userId=123', {
            method: 'PATCH',
          }),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'https://httpbin.org/patch')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'PATCH')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })
    })
  })
})
