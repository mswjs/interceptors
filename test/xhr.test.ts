import { RequestInterceptor } from '../src'

describe('XHR', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.on('request', (req) => {
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

  describe('given I perform an XMLHttpRequest', () => {
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
})
