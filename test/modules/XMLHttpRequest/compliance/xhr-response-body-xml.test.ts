/**
 * @jest-environment jsdom
 */
import { DOMParser } from '@xmldom/xmldom'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const XML_STRING = '<node key="value">Content</node>'

describe('Content-Type: application/xml', () => {
  const interceptor = new XMLHttpRequestInterceptor()
  interceptor.on('request', (request) => {
    request.respondWith({
      headers: { 'Content-Type': 'application/xml' },
      status: 200,
      body: XML_STRING,
    })
  })

  beforeAll(() => {
    interceptor.apply()
  })

  afterAll(() => {
    interceptor.dispose()
  })

  test('supports a mocked response with an XML response body', async () => {
    const req = await createXMLHttpRequest((req) => {
      req.open('GET', '/arbitrary-url')
      req.send()
    })

    expect(req.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'application/xml')
    )
  })
})

describe('Content-Type: text/xml', () => {
  const interceptor = new XMLHttpRequestInterceptor()
  interceptor.on('request', (request) => {
    request.respondWith({
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
      body: XML_STRING,
    })
  })

  beforeAll(() => {
    interceptor.apply()
  })

  afterAll(() => {
    interceptor.dispose()
  })

  test('supports a mocked response with an XML response body', async () => {
    const req = await createXMLHttpRequest((req) => {
      req.open('GET', '/arbitrary-url')
      req.send()
    })

    expect(req.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'text/xml')
    )
  })
})
