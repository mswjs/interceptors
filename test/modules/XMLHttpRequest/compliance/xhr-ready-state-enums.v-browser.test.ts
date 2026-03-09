import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('exposes ready state enums as static properties on XMLHttpRequest', () => {
  expect.soft(XMLHttpRequest.UNSENT).toEqual(0)
  expect.soft(XMLHttpRequest.OPENED).toEqual(1)
  expect.soft(XMLHttpRequest.HEADERS_RECEIVED).toEqual(2)
  expect.soft(XMLHttpRequest.LOADING).toEqual(3)
  expect.soft(XMLHttpRequest.DONE).toEqual(4)
})

it('exposes ready state enums as instance-level properties', () => {
  const xhr = new XMLHttpRequest()
  expect.soft(xhr.UNSENT).toEqual(0)
  expect.soft(xhr.OPENED).toEqual(1)
  expect.soft(xhr.HEADERS_RECEIVED).toEqual(2)
  expect.soft(xhr.LOADING).toEqual(3)
  expect.soft(xhr.DONE).toEqual(4)
})
