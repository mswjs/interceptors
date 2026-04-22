// @vitest-environment happy-dom
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
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

it('patches the original XMLHttpRequest response', async ({ task }) => {
  interceptor.on('request', async ({ request, controller }) => {
    const url = new URL(request.url)

    if (url.searchParams.get('type') === 'passthrough') {
      return controller.passthrough()
    }

    const originalRequest = new XMLHttpRequest()
    url.searchParams.set('type', 'passthrough')
    originalRequest.open(request.method, url.href)
    originalRequest.send(await request.text())
    originalRequest.onerror = () => console.log('ERROR')
    originalRequest.onabort = () => console.trace('ABORT')
    await waitForXMLHttpRequest(originalRequest)

    controller.respondWith(
      new Response(`${originalRequest.responseText}-patched`, {
        headers: {
          'access-control-allow-origin': '*',
          'content-length': '15',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('POST', server.http.url('/'))
  request.send('payload')

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('payload-patched')
  expect.soft(request.responseURL).toBe(server.http.url('/').href)

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 15, total: 15 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 15, total: 15 }],
      ['loadend', 4, { loaded: 15, total: 15 }],
    ])
  }
})
