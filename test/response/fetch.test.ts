/**
 * @jest-environment node
 */
import fetch, { Response } from 'node-fetch'
import { RequestInterceptor } from '../../src'

describe('fetch', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.use((req) => {
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
    describe('and that request is handled by the middleware', () => {
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

    describe('and that request is not handled by the middleware', () => {
      let res: Response

      beforeAll(async () => {
        res = await fetch('http://httpbin.org/get')
      })

      it('should return original response', async () => {
        const body = await res.json()

        expect(res.status).toEqual(200)
        expect(body).toHaveProperty('url', 'http://httpbin.org/get')
      })
    })
  })

  describe('given I perform an HTTPS request using fetch', () => {
    describe('and that request is handled by the middleware', () => {
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

    describe('and that request is not handled by the middleware', () => {
      let res: Response

      beforeAll(async () => {
        res = await fetch('https://httpbin.org/get')
      })

      it('should return original response', async () => {
        const body = await res.json()

        expect(res.status).toEqual(200)
        expect(body).toHaveProperty('url', 'https://httpbin.org/get')
      })
    })
  })

  describe('given I restored the original implementation', () => {
    beforeAll(() => {
      interceptor.restore()
    })

    describe('and perform an HTTP request', () => {
      let res: Response

      beforeAll(async () => {
        res = await fetch('http://httpbin.org/get')
      })

      it('should return original response', async () => {
        const body = await res.json()

        expect(res.status).toEqual(200)
        expect(body).toHaveProperty('url', 'http://httpbin.org/get')
      })
    })

    describe('and perform an HTTPS request', () => {
      let res: Response

      beforeAll(async () => {
        res = await fetch('https://httpbin.org/get')
      })

      it('should return original response', async () => {
        const body = await res.json()

        expect(res.status).toEqual(200)
        expect(body).toHaveProperty('url', 'https://httpbin.org/get')
      })
    })
  })
})
