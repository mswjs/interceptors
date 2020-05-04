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
        httpsGet('https://httpbin.org/get?userId=123'),
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
})
