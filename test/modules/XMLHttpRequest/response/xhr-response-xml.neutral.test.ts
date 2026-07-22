// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

const XML_STRING = '<node key="value">Content</node>'
const domParser = new DOMParser()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a bypassed request with an XML response', async ({ task }) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('POST', server.http.url('/xml'))
  request.setRequestHeader('content-type', 'application/xml')
  request.send(XML_STRING)

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toEqual(XML_STRING)

  if (task.file.projectName === 'browser') {
    /**
     * @note XML response parsing in HappyDOM is broken.
     */
    expect
      .soft(request.responseXML)
      .toEqual(domParser.parseFromString(XML_STRING, 'application/xml'))

    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 32, total: 32 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 32, total: 32 }],
      ['loadend', 4, { loaded: 32, total: 32 }],
    ])
  }
})

it('responds with a mocked "application/xml" response', async ({ task }) => {
  const XML_STRING = '<node key="value">Content</node>'

  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    controller.respondWith(
      new Response(XML_STRING, {
        headers: {
          'content-type': 'application/xml',
          'content-length': '32',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', '/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe(XML_STRING)

  if (task.file.projectName === 'browser') {
    expect
      .soft(request.responseXML)
      .toStrictEqual(domParser.parseFromString(XML_STRING, 'application/xml'))

    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 32, total: 32 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 32, total: 32 }],
      ['loadend', 4, { loaded: 32, total: 32 }],
    ])
  }
})

it('responds with a mocked "text/html" response', async ({ task }) => {
  const XML_STRING = '<node key="value">Content</node>'

  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    controller.respondWith(
      new Response(XML_STRING, {
        headers: {
          'content-type': 'text/xml',
          'content-length': '32',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', '/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe(XML_STRING)

  if (task.file.projectName === 'browser') {
    expect
      .soft(request.responseXML)
      .toStrictEqual(domParser.parseFromString(XML_STRING, 'text/xml'))

    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 32, total: 32 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 32, total: 32 }],
      ['loadend', 4, { loaded: 32, total: 32 }],
    ])
  }
})
