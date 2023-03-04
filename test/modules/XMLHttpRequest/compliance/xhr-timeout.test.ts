// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/7
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { sleep } from '../../../../test/helpers'
import { createXMLHttpRequest } from '../../../helpers'
import { DeferredPromise } from '@open-draft/deferred-promise'

const httpServer = new HttpServer((app) => {
  app.get('/', async (_req, res) => {
    await sleep(50)
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

  createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.timeout = 1
    req.ontimeout = function customTimeoutCallback() {
      timeoutCalled.resolve(this.readyState)
    }
    req.send()
  }).catch(console.error)

  const nextReadyState = await timeoutCalled
  expect(nextReadyState).toBe(4)
})

it('handles request timeout via the "timeout" event listener', async () => {
  const timeoutCalled = new DeferredPromise<number>()

  createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.timeout = 1
    req.addEventListener('timeout', function customTimeoutListener() {
      expect(this.readyState).toBe(4)
      timeoutCalled.resolve(this.readyState)
    })
    req.send()
  }).catch(console.error)

  const nextReadyState = await timeoutCalled
  expect(nextReadyState).toBe(4)
})
