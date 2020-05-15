/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsGet } from '../../helpers'

describe('https.get', () => {
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

  describe('given I perform a request using http.get', () => {
    let request: InterceptedRequest | undefined

    beforeAll(async () => {
      request = await prepare(
        httpsGet('https://httpbin.org/get?userId=123', {
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

    it('should access custom request headers', () => {
      expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
    })
  })
})
