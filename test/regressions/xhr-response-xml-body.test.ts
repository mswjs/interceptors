import { DOMParser } from 'xmldom'
import { createInterceptor } from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../helpers'

const XML_STRING = '<node key="value">Content</node>'

describe('Content-Type: application/xml', () => {
  const interceptor = createInterceptor({
    modules: [interceptXMLHttpRequest],
    resolver() {
      return {
        headers: { 'Content-Type': 'application/xml' },
        status: 200,
        body: XML_STRING,
      }
    },
  })

  beforeAll(() => {
    interceptor.apply()
  })

  afterAll(() => {
    interceptor.restore()
  })

  test('supports XHR mocked response with an XML response body', async () => {
    const req = await createXMLHttpRequest((req) => {
      req.open('GET', '/arbitrary-url')
    })

    expect(req.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'application/xml')
    )
  })
})

describe('Content-Type: text/xml', () => {
  const interceptor = createInterceptor({
    modules: [interceptXMLHttpRequest],
    resolver() {
      return {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
        body: XML_STRING,
      }
    },
  })

  beforeAll(() => {
    interceptor.apply()
  })

  afterAll(() => {
    interceptor.restore()
  })

  test('supports XHR mocked response with an XML response body', async () => {
    const req = await createXMLHttpRequest((req) => {
      req.open('GET', '/arbitrary-url')
    })

    expect(req.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'text/xml')
    )
  })
})
