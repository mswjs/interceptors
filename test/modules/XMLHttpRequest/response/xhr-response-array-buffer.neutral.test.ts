// @vitest-environment happy-dom
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

/**
 * @note Use this utility because in Node.js (JSDOM), "request.response"
 * becomes Uint8Array while in the browser it's correctly ArrayBuffer.
 */
function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof Uint8Array) {
    return value.buffer
  }

  return value
}

it('intercepts a bypassed request with an ArrayBuffer response', async ({
  task,
}) => {
  const buffer = new TextEncoder().encode('hello world')

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'arraybuffer'
  request.open('POST', server.http.url('/arraybuffer'))
  request.setRequestHeader('content-type', 'application/octet-stream')
  request.send(buffer)

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/octet-stream')
  expect.soft(toArrayBuffer(request.response)).toEqual(buffer.buffer)

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 11, total: 11 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
  }
})

it('responds with a mocked ArrayBuffer response to an HTTP request', async ({
  task,
}) => {
  const buffer = new TextEncoder().encode('hello world')

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(buffer, {
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/octet-stream',
          'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'arraybuffer'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/octet-stream')
  expect.soft(toArrayBuffer(request.response)).toEqual(buffer.buffer)

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 11, total: 11 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
  }
})

it('responds with a mocked ArrayBuffer response to an HTTPS request', async ({
  task,
}) => {
  const buffer = new TextEncoder().encode('hello world')

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(buffer, {
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/octet-stream',
          'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'arraybuffer'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/octet-stream')
  expect.soft(toArrayBuffer(request.response)).toEqual(buffer.buffer)

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 11, total: 11 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
  }
})
