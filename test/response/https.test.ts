/**
 * @jest-environment node
 */
import https from 'https'
import { IncomingMessage } from 'http'
import { RequestInterceptor } from '../../src'

describe('https', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.use((req) => {
      if (['https://test.msw.io/'].includes(req.url)) {
        return {
          status: 301,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mocked: true }),
        }
      }
    })
  })

  afterAll(() => {
    interceptor.restore()
  })

  describe('given I perform request using https.request', () => {
    describe('and that request is handled by the middleware', () => {
      let res: IncomingMessage
      let resBody: string = ''

      beforeAll((done) => {
        const req = https.request('https://test.msw.io', (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk) => (resBody += chunk))
          res.on('end', done)
        })

        req.on('response', (original) => (res = original))
        req.end()
      })

      it('should return mocked status code', () => {
        expect(res.statusCode).toEqual(301)
      })

      it('should return mocked headers', () => {
        expect(res.headers).toHaveProperty('content-type', 'application/json')
      })

      it('should return mocked body', () => {
        expect(resBody).toEqual(JSON.stringify({ mocked: true }))
      })
    })

    describe('and that request is not handled by the middleware', () => {
      let res: IncomingMessage
      let resBody: string = ''

      beforeAll((done) => {
        const req = https.request('https://httpbin.org/get', (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk) => (resBody += chunk))
          res.on('end', done)
        })

        req.on('response', (original) => (res = original))
        req.end()
      })

      it('should return mocked status code', () => {
        expect(res.statusCode).toEqual(200)
        expect(resBody).toContain(`\"url\": \"https://httpbin.org/get\"`)
      })
    })
  })

  describe('given I perform request using https.get', () => {
    describe('and that request is handled by the middleware', () => {
      let res: IncomingMessage
      let resBody: string = ''

      beforeAll((done) => {
        const req = https.get('https://test.msw.io', (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk) => (resBody += chunk))
          res.on('end', done)
        })

        req.on('response', (original) => (res = original))
        req.end()
      })

      it('should return mocked status code', () => {
        expect(res.statusCode).toEqual(301)
      })

      it('should return mocked headers', () => {
        expect(res.headers).toHaveProperty('content-type', 'application/json')
      })

      it('should return mocked body', () => {
        expect(resBody).toEqual(JSON.stringify({ mocked: true }))
      })
    })

    describe('and that request is not handled by the middleware', () => {
      let res: IncomingMessage
      let resBody: string = ''

      beforeAll((done) => {
        const req = https.get('https://httpbin.org/get', (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk) => (resBody += chunk))
          res.on('end', done)
        })

        req.on('response', (original) => (res = original))
        req.end()
      })

      it('should return mocked status code', () => {
        expect(res.statusCode).toEqual(200)
        expect(resBody).toContain(`\"url\": \"https://httpbin.org/get\"`)
      })
    })
  })

  describe('given I restored the original implementation', () => {
    beforeAll(() => {
      interceptor.restore()
    })

    describe('and I perform an HTTPS request', () => {
      let resBody: string = ''

      beforeAll((done) => {
        const req = https.get('https://httpbin.org/get', (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk) => (resBody += chunk))
          res.on('end', done)
        })
        req.end()
      })

      it('should return original response', () => {
        expect(resBody).toContain(`\"url\": \"https://httpbin.org/get\"`)
      })
    })
  })
})
