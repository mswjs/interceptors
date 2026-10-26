import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  spyOnXMLHttpRequest,
  spyOnXMLHttpRequestUpload,
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

it('aborts a pending request when ".abort()" is called', async () => {
  const requestListenerCalled = Promise.withResolvers<void>()
  const requestHandled = Promise.withResolvers<void>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    // Keep the request pending until the interceptor acknowledges the abort.
    await controller.handled
    requestHandled.resolve()
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
  const abortCallback = vi.fn()
  const uploadAbortCallback = vi.fn()
  request.onabort = abortCallback
  request.upload.onabort = uploadAbortCallback
  request.open('POST', server.http.url('/resource'))
  request.send('hello world')

  await requestListenerCalled.promise
  request.abort()

  await waitForXMLHttpRequest(request).catch(() => {})
  await requestHandled.promise

  expect.soft(events.slice(-3)).toEqual([
    ['readystatechange', 4],
    ['abort', 4, { loaded: 0, total: 0 }],
    ['loadend', 4, { loaded: 0, total: 0 }],
  ])
  expect.soft(uploadEvents.slice(-2)).toEqual([
    ['abort', { loaded: 0, total: 0 }],
    ['loadend', { loaded: 0, total: 0 }],
  ])
  expect.soft(abortCallback).toHaveBeenCalledOnce()
  expect.soft(uploadAbortCallback).toHaveBeenCalledOnce()
  expect.soft(request.readyState).toBe(XMLHttpRequest.UNSENT)
  expect.soft(request.status).toBe(0)
  expect.soft(request.responseText).toBe('')
})

it('does not deliver a mocked response to a request aborted while pending', async () => {
  const requestListenerCalled = Promise.withResolvers<void>()
  const respondGate = Promise.withResolvers<void>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    await respondGate.promise
    controller.respondWith(new Response('hello world'))
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/resource'))
  request.send()

  await requestListenerCalled.promise
  // Release the listener and abort in the same tick so the listener
  // responds after the abort fires but before the interceptor observes it.
  respondGate.resolve()
  request.abort()

  await waitForXMLHttpRequest(request).catch(() => {})

  const eventNames = events.map(([name]) => name)
  expect.soft(eventNames).toContain('abort')
  expect.soft(eventNames).not.toContain('load')
  expect.soft(request.readyState).toBe(XMLHttpRequest.UNSENT)
  expect.soft(request.status).toBe(0)
  expect.soft(request.responseText).toBe('')
})
