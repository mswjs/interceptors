import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { createXMLHttpRequest } from '../helpers'

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

test('supports XHR mocked response with an empty response body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
  })

  expect(req.status).toBe(401)
  expect(req.response).toBe('')
})
