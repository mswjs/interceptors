// @vitest-environment happy-dom
import {
  spyOnXMLHttpRequest,
  spyOnXMLHttpRequestUpload,
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

it('intercepts a bypassed request with the upload listeners', async ({
  task,
}) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
  request.open('POST', server.http.url('/upload'))
  request.send(new Blob(['hello', ' ', 'world']))

  await waitForXMLHttpRequest(request)

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      /**
       * @note This is the response progress event since the test server
       * responds with the same payload that the request sent.
       */
      ['progress', 3, { loaded: 11, total: 11 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 11, total: 11 }],
      ['loadend', 4, { loaded: 11, total: 11 }],
    ])
    expect.soft(uploadEvents).toEqual([
      ['loadstart', { loaded: 0, total: 11 }],
      ['progress', { loaded: 11, total: 11 }],
      ['load', { loaded: 11, total: 11 }],
      ['loadend', { loaded: 11, total: 11 }],
    ])
  }
})

it('fires the upload events for a mocked request', async ({ task }) => {
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

    controller.respondWith(
      new Response(request.body, {
        headers: {
          'content-type': 'text/plain',
          // 'content-length': '11',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
  request.open('POST', 'http://any.host.here/irrelevant')
  request.send(new Blob(['hello', ' ', 'world']))

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')

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
    expect.soft(uploadEvents).toEqual([
      ['loadstart', { loaded: 0, total: 11 }],
      ['progress', { loaded: 11, total: 11 }],
      ['load', { loaded: 11, total: 11 }],
      ['loadend', { loaded: 11, total: 11 }],
    ])
  }
})
