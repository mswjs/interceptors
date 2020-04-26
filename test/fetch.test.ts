/**
 * @jest-environment node
 */
import fetch, { Response } from 'node-fetch'
import { RequestInterceptor } from '../src'

describe('fetch', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()

    interceptor.on('request', (req) => {
      console.log('Intercepted %s %s', req.method, req.url)
    })
  })

  afterAll(() => {
    interceptor.restore()
  })

  describe('given I perform a request', () => {
    let res: Response

    beforeAll(async () => {
      res = await fetch('http://api.github.com')
    })

    it('should return the mocked response', async () => {
      const body = await res.json()

      expect(body).toEqual({
        mocked: true,
      })
    })
  })
})
