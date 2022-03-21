/**
 * @jest-environment jsdom
 */
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(event) {
    event.respondWith({
      status: 401,
      statusText: 'Unathorized',
      // @ts-nocheck JavaScript clients and type-casting may
      // circument the mocked response body type signature,
      // setting in invalid value.
      body: null as any,
    })
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('supports XHR mocked response with an empty response body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.send()
  })

  expect(req.status).toEqual(401)
  expect(req.response).toEqual('')
})
