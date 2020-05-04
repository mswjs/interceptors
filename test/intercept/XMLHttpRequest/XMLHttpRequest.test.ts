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

describe('XMLHttpRequest', () => {
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

  describe('given I perform an HTTP XMLHttpRequest', () => {
    describe('GET', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareXHR(
          xhr('GET', 'http://httpbin.org/get?userId=123'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'http://httpbin.org/get')
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
        request = await prepareXHR(
          xhr('POST', 'http://httpbin.org/post?userId=123', 'request-body'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'http://httpbin.org/post')
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
        request = await prepareXHR(
          xhr('PUT', 'http://httpbin.org/put?userId=123'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'http://httpbin.org/put')
      })

      it('should access request method', () => {
        expect(request).toHaveProperty('method', 'PUT')
      })

      it('should access request query parameters', () => {
        expect(request?.query.get('userId')).toEqual('123')
      })
    })

    describe('DELETE', () => {
      let request: InterceptedRequest | undefined

      beforeAll(async () => {
        request = await prepareXHR(
          xhr('DELETE', 'http://httpbin.org/delete?userId=123'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'http://httpbin.org/delete')
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
        request = await prepareXHR(
          xhr('PATCH', 'http://httpbin.org/patch?userId=123'),
          pool
        )
      })

      it('should intercept the request', () => {
        expect(request).toBeTruthy()
      })

      it('should access request url', () => {
        expect(request).toHaveProperty('url', 'http://httpbin.org/patch')
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
