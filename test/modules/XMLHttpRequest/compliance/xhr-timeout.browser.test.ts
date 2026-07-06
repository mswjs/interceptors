// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/interceptors/issues/7
 */
import { DeferredPromise } from '@open-draft/deferred-promise'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  setTimeout,
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

it('fires the "ontimeout" callback for a bypassed request', async () => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/delay'))

  request.timeout = 5
  const timeoutCallback = vi.fn()
  request.ontimeout = timeoutCallback

  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.readyState).toBe(4)
  expect.soft(timeoutCallback).toHaveBeenCalledOnce()
  expect.soft(events).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1, { loaded: 0, total: 0 }],
    ['readystatechange', 4],
    ['timeout', 4, { loaded: 0, total: 0 }],
    ['loadend', 4, { loaded: 0, total: 0 }],
  ])
})

it('dispatches the "timeout" event for a bypassed request', async () => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/delay'))

  request.timeout = 5
  const timeoutListener = vi.fn()
  request.addEventListener('timeout', timeoutListener)

  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.readyState).toBe(4)
  expect.soft(timeoutListener).toHaveBeenCalledOnce()
  expect.soft(events).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1, { loaded: 0, total: 0 }],
    ['readystatechange', 4],
    ['timeout', 4, { loaded: 0, total: 0 }],
    ['loadend', 4, { loaded: 0, total: 0 }],
  ])
})
