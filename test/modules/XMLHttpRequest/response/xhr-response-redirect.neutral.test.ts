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

it('intercepts a bypassed request with a redirect response', async ({
  task,
}) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/redirect'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getResponseHeader('content-type'))
    .toBe('text/html; charset=utf-8')
  expect.soft(request.response).toBe('destination-body')
  expect
    .soft(request.responseURL)
    .toBe(server.http.url('/redirect/destination').href)

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 16, total: 16 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 16, total: 16 }],
      ['loadend', 4, { loaded: 16, total: 16 }],
    ])
  }
})

it('responds with a mocked redirect response', async ({ task }) => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
          },
        })
      )
    }

    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        new Response(null, {
          status: 301,
          headers: {
            location: new URL('/destination', request.url).href,
          },
        })
      )
    }

    controller.respondWith(new Response('destination-body'))
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/original')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getResponseHeader('content-type'))
    .toBe('text/plain;charset=UTF-8')
  expect.soft(request.response).toBe('destination-body')
  expect.soft(request.responseURL).toBe('http://any.host.here/destination')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 16, total: 16 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 16, total: 16 }],
      ['loadend', 4, { loaded: 16, total: 16 }],
    ])
  }
})
