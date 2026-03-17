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

it('intercepts a bypassed request with a blob response', async ({ task }) => {
  const blob = new Blob(['hello world'], { type: 'text/plain' })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'blob'
  request.open('POST', server.http.url('/blob'))
  request.send(blob)

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  /**
   * @note Strict equality won't work here because Undici appends "charset=utf-8"
   * to the response Blob. The browser, however, does not do that.
   */
  expect(request.response).instanceOf(Blob)
  await expect
    .soft(request.response.arrayBuffer())
    .resolves.toEqual(await blob.arrayBuffer())

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
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

it('responds with a mocked Blob response to an HTTP request', async ({
  task,
}) => {
  const blob = new Blob(['hello world'], { type: 'text/plain' })

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(blob, {
        headers: {
          'access-control-allow-origin': '*',
          'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'blob'
  request.open('GET', server.http.url('/blob'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  /**
   * @note Strict equality won't work here because Undici appends "charset=utf-8"
   * to the response Blob. The browser, however, does not do that.
   */
  expect(request.response).instanceOf(Blob)
  await expect
    .soft(request.response.arrayBuffer())
    .resolves.toEqual(await blob.arrayBuffer())

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
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

it('responds with a mocked Blob response to an HTTP request', async ({
  task,
}) => {
  const blob = new Blob(['hello world'], { type: 'text/plain' })

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(blob, {
        headers: {
          'access-control-allow-origin': '*',
          'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'blob'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  /**
   * @note Strict equality won't work here because Undici appends "charset=utf-8"
   * to the response Blob. The browser, however, does not do that.
   */
  expect(request.response).instanceOf(Blob)
  await expect
    .soft(request.response.arrayBuffer())
    .resolves.toEqual(await blob.arrayBuffer())

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
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
