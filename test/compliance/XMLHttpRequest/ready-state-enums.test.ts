/**
 * @jest-environment jsdom
 */
import { createInterceptor } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('exposes ready state enums both as static and public properties', () => {
  expect(XMLHttpRequest.UNSENT).toBe(0)
  expect(XMLHttpRequest.OPENED).toBe(1)
  expect(XMLHttpRequest.HEADERS_RECEIVED).toBe(2)
  expect(XMLHttpRequest.LOADING).toBe(3)
  expect(XMLHttpRequest.DONE).toBe(4)

  const xhr = new XMLHttpRequest()
  expect(xhr.UNSENT).toBe(0)
  expect(xhr.OPENED).toBe(1)
  expect(xhr.HEADERS_RECEIVED).toBe(2)
  expect(xhr.LOADING).toBe(3)
  expect(xhr.DONE).toBe(4)
})
