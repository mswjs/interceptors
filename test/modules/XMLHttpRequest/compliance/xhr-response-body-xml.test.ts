// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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
    const request = new XMLHttpRequest()
    request.open('GET', '/arbitrary-url')
    request.send()

    await waitForXMLHttpRequest(request)

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
    const request = new XMLHttpRequest()
    request.open('GET', '/arbitrary-url')
    request.send()

    await waitForXMLHttpRequest(request)

    expect(request.responseXML).toStrictEqual(
      new DOMParser().parseFromString(XML_STRING, 'text/xml')
    )
  })
})
