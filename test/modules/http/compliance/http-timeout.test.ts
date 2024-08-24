/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep } from '../../../helpers'

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

it('respects the "timeout" option for a handled request', async () => {
  interceptor.on('request', async ({ controller }) => {
    await sleep(200)
    controller.respondWith(new Response('hello world'))
  })

  const errorListener = vi.fn()
  const timeoutListener = vi.fn()
  const responseListener = vi.fn()
  const request = http.get('http://localhost/resource', {
    timeout: 10,
  })
  request.on('error', errorListener)
  request.on('timeout', () => {
    timeoutListener()
    // Request must be destroyed manually on timeout.
    request.destroy()
  })
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(timeoutListener).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})

it('respects the "timeout" option for a bypassed request', async () => {
  const errorListener = vi.fn()
  const timeoutListener = vi.fn()
  const responseListener = vi.fn()
  const request = http.get(httpServer.http.url('/resource'), {
    timeout: 10,
  })
  request.on('error', errorListener)
  request.on('timeout', () => {
    timeoutListener()
    // Request must be destroyed manually on timeout.
    request.destroy()
  })
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(timeoutListener).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})

it('respects a "setTimeout()" on a handled request', async () => {
  interceptor.on('request', async ({ controller }) => {
    const stream = new ReadableStream({
      async start(controller) {
        // Emulate a long pending response stream
        // to trigger the request timeout.
        await sleep(200)
        controller.enqueue(new TextEncoder().encode('hello'))
      },
    })
    controller.respondWith(new Response(stream))
  })

  const errorListener = vi.fn()
  const timeoutListener = vi.fn()
  const setTimeoutCallback = vi.fn()
  const responseListener = vi.fn()
  const request = http.get('http://localhost/resource')

  /**
   * @note `request.setTimeout(n)` is NOT equivalent to
   * `{ timeout: n }` in request options.
   *
   * - { timeout: n } acts on the http.Agent level and
   * sets the timeout on every socket once it's CREATED.
   *
   * - setTimeout(n) omits the http.Agent, and sets the
   * timeout once the socket emits "connect".
   * This timeout takes effect only after the connection,
   * so in our case, the mock/bypassed response MUST start,
   * and only if the response itself takes more than this timeout,
   * the timeout will trigger.
   */
  request.setTimeout(10, setTimeoutCallback)

  request.on('error', errorListener)
  request.on('timeout', () => {
    timeoutListener()
    request.destroy()
  })
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(timeoutListener).toHaveBeenCalledTimes(1)
  expect(setTimeoutCallback).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})

it('respects a "setTimeout()" on a bypassed request', async () => {
  const errorListener = vi.fn()
  const timeoutListener = vi.fn()
  const responseListener = vi.fn()
  const request = http.get(httpServer.http.url('/resource'))
  request.setTimeout(10)

  request.on('error', errorListener)
  request.on('timeout', () => {
    timeoutListener()
    request.destroy()
  })
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(timeoutListener).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})

it('respects the "socket.setTimeout()" for a handled request', async () => {
  interceptor.on('request', async ({ controller }) => {
    const stream = new ReadableStream({
      async start(controller) {
        // Emulate a long pending response stream
        // to trigger the request timeout.
        await sleep(200)
        controller.enqueue(new TextEncoder().encode('hello'))
      },
    })
    controller.respondWith(new Response(stream))
  })

  const errorListener = vi.fn()
  const setTimeoutCallback = vi.fn()
  const responseListener = vi.fn()
  const request = http.get('http://localhost/resource')

  request.on('socket', (socket) => {
    /**
     * @note Setting timeout on the socket directly
     * will NOT add the "timeout" listener to the request,
     * unlike "request.setTimeout()".
     */
    socket.setTimeout(10, () => {
      setTimeoutCallback()
      request.destroy()
    })
  })

  request.on('error', errorListener)
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(setTimeoutCallback).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})

it('respects the "socket.setTimeout()" for a bypassed request', async () => {
  const errorListener = vi.fn()
  const setTimeoutCallback = vi.fn()
  const responseListener = vi.fn()
  const request = http.get(httpServer.http.url('/resource'))

  request.on('socket', (socket) => {
    /**
     * @note Setting timeout on the socket directly
     * will NOT add the "timeout" listener to the request,
     * unlike "request.setTimeout()".
     */
    socket.setTimeout(10, () => {
      setTimeoutCallback()
      request.destroy()
    })
  })

  request.on('error', errorListener)
  request.on('response', responseListener)

  const requestClosePromise = new DeferredPromise<void>()
  request.on('close', () => requestClosePromise.resolve())
  await requestClosePromise

  expect(request.destroyed).toBe(true)
  expect(setTimeoutCallback).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNRESET',
    })
  )
  expect(responseListener).not.toHaveBeenCalled()
})
