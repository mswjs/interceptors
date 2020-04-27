/**
 * @jest-enviroment node
 */
import fetch, { Response } from 'node-fetch'
import { RequestInterceptor } from '../src'

describe('fetch', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.on('request', (req) => {
      if (
        ['https://api.github.com/', 'http://api.github.com/'].includes(req.url)
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

  describe('given I perform an HTTP request using fetch', () => {
    let res: Response

    beforeAll(async () => {
      res = await fetch('http://api.github.com')
    })

    it('should return mocked status code', () => {
      expect(res.status).toEqual(201)
    })

    it('should return mocked body', async () => {
      const body = await res.json()

      expect(body).toEqual({
        mocked: true,
      })
    })

    it('should return mocked headers', () => {
      expect(res.headers.get('content-type')).toEqual('application/hal+json')
    })
  })

  describe('given I perform an HTTPS request using fetch', () => {
    let res: Response

    beforeAll(async () => {
      res = await fetch('https://api.github.com')
    })

    it('should return mocked status code', () => {
      expect(res.status).toEqual(201)
    })

    it('should return mocked body', async () => {
      const body = await res.json()

      expect(body).toEqual({
        mocked: true,
      })
    })

    it('should return mocked headers', () => {
      expect(res.headers.get('content-type')).toEqual('application/hal+json')
    })
  })

  describe('given I cleaned up', () => {
    beforeAll(() => {
      interceptor.restore()
    })

    describe('and perform a request', () => {
      let res: Response

      beforeAll(async () => {
        res = await fetch('http://api.github.com')
      })

      it('should return an original response', async () => {
        const body = await res.json()

        expect(res.status).toEqual(200)
        expect(body).toHaveProperty('gists_url')
      })
    })
  })
})
