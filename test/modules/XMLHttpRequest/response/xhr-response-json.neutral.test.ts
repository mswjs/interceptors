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

it('intercepts a bypassed request with a JSON response', async ({ task }) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'json'
  request.open('POST', server.http.url('/empty'))
  request.setRequestHeader('content-type', 'application/json')
  request.send(JSON.stringify({ name: 'John Maverick' }))

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 24, total: 24 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 24, total: 24 }],
      ['loadend', 4, { loaded: 24, total: 24 }],
    ])
  }
})

it('responds with a mocked text response to an HTTP request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      Response.json(
        { name: 'John Maverick' },
        {
          headers: {
            'access-control-allow-origin': '*',
            'content-length': '24',
          },
        }
      )
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 24, total: 24 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 24, total: 24 }],
      ['loadend', 4, { loaded: 24, total: 24 }],
    ])
  }
})

it('responds with a mocked text response to an HTTPS request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      Response.json(
        { name: 'John Maverick' },
        {
          headers: {
            'access-control-allow-origin': '*',
            'content-length': '24',
          },
        }
      )
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.responseType = 'json'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 24, total: 24 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 24, total: 24 }],
      ['loadend', 4, { loaded: 24, total: 24 }],
    ])
  }
})
