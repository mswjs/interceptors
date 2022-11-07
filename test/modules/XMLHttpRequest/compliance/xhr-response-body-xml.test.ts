/**
 * @jest-environment jsdom
 */
import { Response } from '@remix-run/web-fetch'
import { DOMParser } from '@xmldom/xmldom'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const XML_STRING = '<node key="value">Content</node>'

describe('Content-Type: application/xml', () => {
  const interceptor = new XMLHttpRequestInterceptor()
  interceptor.on('request', (request) => {
    request.respondWith(
      new Response(XML_STRING, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      })
    )
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
    request.respondWith(
      new Response(XML_STRING, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      })
    )
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
