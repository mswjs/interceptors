import { createInterceptor } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../helpers'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {
    return {
      headers: {
        'e-tag': '123',
        'x-powered-by': 'msw',
      },
    }
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('retrieves the response headers when called ".getAllResponseHeaders()"', async () => {
  const request = await createXMLHttpRequest((req) => {
    req.open('GET', '/')
  })

  const responseHeaders = request.getAllResponseHeaders()
  expect(responseHeaders).toEqual('e-tag: 123\r\nx-powered-by: msw')
})
