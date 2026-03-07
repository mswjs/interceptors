// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

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

it('intercepts a synchronous bypassed request', async ({ task }) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('POST', server.http.url('/'), false)
  request.setRequestHeader('content-type', 'text/plain')
  request.send('hello world')

  /**
   * @note In a regular synchronous XMLHttpRequest, you don't have to
   * await anything as ".send()" will block the thread and consume the
   * response body synchronously. We cannot do that since ".respondWith()"
   * is async by design.
   */
  await waitForXMLHttpRequest(request, false)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  expect.soft(request.response).toBe('hello world')
  expect.soft(request.responseText).toBe('hello world')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
  }
})

/**
 * @note The way HappyDOM performs synchronous XMLHttpRequest is via "ChildProcess.execFileSync",
 * which bypassed the "net.connect()" and makes such requests invisible to our interceptor.
 * We do not support synchronous XMLHttpRequest.
 */
it('mocks response to a synchronous XMLHttpRequest', async ({ task }) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
          'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/'), false)
  request.send()

  await waitForXMLHttpRequest(request, false)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  expect.soft(request.response).toBe('hello world')
  expect.soft(request.responseText).toBe('hello world')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
  }
})
