// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('exposes ready state enums both as static and public properties', () => {
  expect(XMLHttpRequest.UNSENT).toEqual(0)
  expect(XMLHttpRequest.OPENED).toEqual(1)
  expect(XMLHttpRequest.HEADERS_RECEIVED).toEqual(2)
  expect(XMLHttpRequest.LOADING).toEqual(3)
  expect(XMLHttpRequest.DONE).toEqual(4)

  const xhr = new XMLHttpRequest()
  expect(xhr.UNSENT).toEqual(0)
  expect(xhr.OPENED).toEqual(1)
  expect(xhr.HEADERS_RECEIVED).toEqual(2)
  expect(xhr.LOADING).toEqual(3)
  expect(xhr.DONE).toEqual(4)
})
