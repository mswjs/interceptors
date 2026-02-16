// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'
import { setTimeout } from 'node:timers/promises'

const httpServer = new HttpServer((app) => {
  app.get('/resource', async (req, res) => {
    await sleep(200)
    res.status(500).end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('respects the "signal" for a handled request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const abortController = new AbortController()
  const request = http.get(
    httpServer.http.url('/resource'),
    {
      signal: abortController.signal,
    },
    () => {
      abortController.abort('abort reason')
    }
  )

  // Must listen to the "close" event instead of "abort".
  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  // ClientRequest doesn't expose the destroy reason.
  // It's kept in the kError symbol but we won't be going there.
  expect(request.destroyed).toBe(true)
})

it('respects the "signal" for a bypassed request', async () => {
  const abortController = new AbortController()
  const request = http.get(
    httpServer.http.url('/resource'),
    {
      signal: abortController.signal,
    },
    () => {
      abortController.abort('abort reason')
    }
  )

  // Must listen to the "close" event instead of "abort".
  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  // ClientRequest doesn't expose the destroy reason.
  // It's kept in the kError symbol but we won't be going there.
  expect(request.destroyed).toBe(true)
})

it('handles a request within a timeout', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const timeoutListener = vi.fn()
  const request = http.get('http://localhost/resource', {
    signal: AbortSignal.timeout(200),
  })
  request.on('timeout', timeoutListener)

  await waitForClientRequest(request)

  expect(request.destroyed).toBe(false)
  expect(timeoutListener).not.toHaveBeenCalled()
})

it('respects "AbortSignal.timeout()" for a handled request', async () => {
  interceptor.on('request', async ({ controller }) => {
    // Delay the mock response to "AbortSignal.timeout" fires off first.
    await setTimeout(300)
    controller.respondWith(new Response('hello world'))
  })

  const timeoutListener = vi.fn()
  const request = http.get('http://localhost/resource', {
    signal: AbortSignal.timeout(100),
  })
  request.on('timeout', timeoutListener)

  const abortError = await waitForClientRequest(request).then(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  expect(abortError).toMatchObject({
    code: 'ABORT_ERR',
    name: 'AbortError',
    message: 'The operation was aborted',
  })

  expect(request.destroyed).toBe(true)
  /**
   * @note Timeout due to "AbortSignal" is considered an error, not a timeout.
   */
  expect(timeoutListener).not.toHaveBeenCalled()
})

it('respects "AbortSignal.timeout()" for a bypassed request', async () => {
  const timeoutListener = vi.fn()
  const request = http.get(httpServer.http.url('/resource'), {
    signal: AbortSignal.timeout(10),
  })
  request.on('timeout', timeoutListener)

  // Must listen to the "close" event instead of "abort".
  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(timeoutListener).not.toHaveBeenCalled()
})
