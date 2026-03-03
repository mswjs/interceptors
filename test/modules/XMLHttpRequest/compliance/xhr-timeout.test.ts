// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/7
 */
import { setTimeout } from 'node:timers/promises'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', async (_req, res) => {
    await setTimeout(50)
    res.send('ok')
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles request timeout via the "ontimeout" callback', async () => {
  const timeoutCalled = new DeferredPromise<number>()

  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/'))
  request.timeout = 1
  request.ontimeout = function customTimeoutCallback() {
    timeoutCalled.resolve(this.readyState)
  }
  request.send()

  await waitForXMLHttpRequest(request)

  const nextReadyState = await timeoutCalled
  expect(nextReadyState).toBe(4)
})

it('handles request timeout via the "timeout" event listener', async () => {
  const timeoutCalled = new DeferredPromise<number>()

  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/'))
  request.timeout = 1
  request.addEventListener('timeout', function customTimeoutListener() {
    expect(this.readyState).toBe(4)
    timeoutCalled.resolve(this.readyState)
  })
  request.send()

  await waitForXMLHttpRequest(request)

  const nextReadyState = await timeoutCalled
  expect(nextReadyState).toBe(4)
})
