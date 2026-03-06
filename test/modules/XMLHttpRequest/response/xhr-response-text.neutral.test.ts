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

it('intercepts a bypassed request with a text response', async ({ task }) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('POST', server.http.url('/blob'))
  request.send('hello world')

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  expect(request.response).toBe('hello world')
  expect(request.responseText).toBe('hello world')

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

it('responds with a mocked text response to an HTTP request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain;charset=utf-8')
  expect.soft(request.response).toBe('hello world')
  expect.soft(request.responseText).toBe('hello world')

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

it('responds with a mocked text response to an HTTPS request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain;charset=utf-8')
  expect.soft(request.response).toBe('hello world')
  expect.soft(request.responseText).toBe('hello world')

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
