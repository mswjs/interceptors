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

it('intercepts a bypassed request with a network error response', async ({
  task,
}) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/network-error'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 4],
      ['error', 4, { loaded: 0, total: 0 }],
      ['loadend', 4, { loaded: 0, total: 0 }],
    ])
  }
})

it('treats Response.error() as a request error for an HTTP request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 4],
      ['error', 4, { loaded: 0, total: 0 }],
      ['loadend', 4, { loaded: 0, total: 0 }],
    ])
  }
})

it('treats Response.error() as a request error for an HTTPS request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 4],
      ['error', 4, { loaded: 0, total: 0 }],
      ['loadend', 4, { loaded: 0, total: 0 }],
    ])
  }
})
