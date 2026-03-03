// @vitest-environment jsdom
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

it('treats "Response.error()" as a request error', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const errorListener = vi.fn()
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)

  request.open('GET', 'http://localhost/resource')
  request.addEventListener('error', errorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')
  expect.soft(events).toEqual([
    ['readystatechange', 1],
    ['readystatechange', 4],
    ['error', 4, { loaded: 0, total: 0 }],
  ])
})
