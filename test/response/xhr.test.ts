import { RequestInterceptor } from '../../src'

interface XhrResponse {
  status: number
  headers: string
  body: string
}

function performXMLHttpRequest(
  method: string,
  url: string
): Promise<XhrResponse> {
  let status: number
  let headers: string
  let body: string

  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest()
    req.onload = () => {
      body = req.response
      headers = req.getAllResponseHeaders()
      status = req.status
      resolve({ status, headers, body })
    }
    req.onerror = reject
    req.open(method, url)
    req.send()
  })
}

describe('XHR', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.use((req) => {
      if (['https://test.msw.io/', 'http://test.msw.io/'].includes(req.url)) {
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

  describe('given I perform an HTTP request using XMLHttpRequest', () => {
    describe('and that request is handled by the middleware', () => {
      let res: XhrResponse

      beforeAll(async () => {
        res = await performXMLHttpRequest('GET', 'http://test.msw.io')
      })

      it('should return a mocked status code', () => {
        expect(res.status).toEqual(301)
      })

      it('should return mocked headers', () => {
        expect(res.headers).toContain('Content-Type: application/hal+json')
      })

      it('should return mocked body', () => {
        expect(res.body).toEqual('foo')
      })
    })

    describe('and that request is not handled by the middleware', () => {
      let res: XhrResponse

      beforeAll(async () => {
        res = await performXMLHttpRequest('GET', 'http://httpbin.org/get')
      })

      it('should return original response', () => {
        expect(res.status).toEqual(200)
        expect(res.body).toContain(`\"url\": \"http://httpbin.org/get\"`)
      })
    })
  })

  describe('given I perform an HTTPS request using XMLHttpRequest', () => {
    describe('and that request is handled by the middleware', () => {
      let res: XhrResponse

      beforeAll(async () => {
        res = await performXMLHttpRequest('GET', 'https://test.msw.io')
      })

      it('should return mocked status code', () => {
        expect(res.status).toEqual(301)
      })

      it('should return mocked headers', () => {
        expect(res.headers).toContain('Content-Type: application/hal+json')
      })

      it('should return mocked body', () => {
        expect(res.body).toEqual('foo')
      })
    })

    describe('and that request is not handled by the middleware', () => {
      let res: XhrResponse

      beforeAll(async () => {
        res = await performXMLHttpRequest('GET', 'https://httpbin.org/get')
      })

      it('should return original response', () => {
        expect(res.status).toEqual(200)
        expect(res.body).toContain(`\"url\": \"https://httpbin.org/get\"`)
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
