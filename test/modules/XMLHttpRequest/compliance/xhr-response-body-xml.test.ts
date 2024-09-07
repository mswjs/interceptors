// @vitest-environment jsdom
import { it, expect, describe, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const XML_STRING = '<node key="value">Content</node>'

describe('Content-Type: application/xml', () => {
  const interceptor = new XMLHttpRequestInterceptor()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
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

  it('supports a mocked response with an XML response body', async () => {
    const request = await createXMLHttpRequest((request) => {
      request.open('GET', '/arbitrary-url')
      request.send()
    })

    expect(request.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'application/xml')
    )
  })
})

describe('Content-Type: text/xml', () => {
  const interceptor = new XMLHttpRequestInterceptor()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
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

  it('supports a mocked response with an XML response body', async () => {
    const request = await createXMLHttpRequest((request) => {
      request.open('GET', '/arbitrary-url')
      request.send()
    })

    expect(request.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'text/xml')
    )
  })
})
