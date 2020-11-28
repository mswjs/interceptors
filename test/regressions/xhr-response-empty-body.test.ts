import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use(() => {
    return {
      status: 401,
      // @ts-nocheck JavaScript clients and type-casting may
      // circument the mocked response body type signature,
      // setting in invalid value.
      body: null as any,
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('supports XHR mocked response with an empty response body', () => {
  const req = new XMLHttpRequest()
  req.responseType = 'text'
  req.open('GET', '/arbitrary-url')
  req.send()

  return new Promise((resolve, reject) => {
    req.addEventListener('error', reject)
    req.addEventListener('abort', reject)

    req.addEventListener('load', () => {
      expect(req.status).toEqual(401)
      expect(req.response).toBe('')

      resolve()
    })
  })
})
