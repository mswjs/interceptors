/**
 * @jest-environment jsdom
 */
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  request.respondWith({
    status: 401,
    statusText: 'Unathorized',
    // @ts-nocheck JavaScript clients and type-casting may
    // circument the mocked response body type signature,
    // setting in invalid value.
    body: null as any,
  })
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

test('sends a mocked response with an empty response body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.send()
  })

  expect(req.status).toEqual(401)
  expect(req.response).toEqual('')
})
