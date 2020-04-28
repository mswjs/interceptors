import { RequestInterceptor } from '../src'

describe('XHR', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.use((req) => {
      if (req.url === 'https://test.msw.io') {
        return {
          status: 301,
          headers: {
            'Content-Type': 'application/hal+json',
          },
          body: 'foo',
        }
      }
    })
  })

  afterAll(() => {
    interceptor.restore()
  })

  describe('given I set up the interception', () => {
    describe('and I perform an XMLHttpRequest', () => {
      describe('and that request is handled in the middleware', () => {
        let status: number
        let headers: string
        let body: string

        beforeAll((done) => {
          const req = new XMLHttpRequest()
          req.onload = () => {
            body = req.response
            headers = req.getAllResponseHeaders()
            status = req.status
            done()
          }
          req.open('GET', 'https://test.msw.io')
          req.send()
        })

        it('should return mocked status code', () => {
          expect(status).toEqual(301)
        })

        it('should return mocked body', () => {
          expect(body).toEqual('foo')
        })

        it('should return mocked headers', () => {
          expect(headers).toContain('Content-Type: application/hal+json')
        })
      })

      describe('and that request is not handled in the middleware', () => {
        let status: number
        let body: string

        beforeAll((done) => {
          const req = new XMLHttpRequest()
          req.onload = () => {
            body = req.response
            status = req.status
            done()
          }
          req.open('GET', 'https://httpbin.org/get')
          req.send()
        })

        it('should return the original response', () => {
          expect(status).toEqual(200)
          expect(body).toContain(`\"url\": \"https://httpbin.org/get\"`)
        })
      })
    })
  })

  describe('given I restored the original implementation', () => {
    beforeAll(() => {
      interceptor.restore()
    })

    describe('and I perform an XMLHttpRequest', () => {
      let status: number
      let body: string

      beforeAll((done) => {
        const req = new XMLHttpRequest()
        req.onload = () => {
          body = req.response
          status = req.status
          done()
        }
        req.open('GET', 'https://httpbin.org/get')
        req.send()
      })

      it('should return the original response', () => {
        expect(status).toEqual(200)
        expect(body).toContain(`\"url\": \"https://httpbin.org/get\"`)
      })
    })
  })
})
