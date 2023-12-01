import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

interface NotFoundError extends NodeJS.ErrnoException {
  hostname: string
}

interface ConnectionError extends NodeJS.ErrnoException {
  address: string
  port: number
}

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('suppresses ECONNREFUSED error given a mocked response', async () => {
  interceptor.once('request', async ({ request }) => {
    await sleep(250)
    request.respondWith(new Response('Mocked'))
  })

  // Connecting to a non-existing host will
  // result in the "ECONNREFUSED" error in Node.js.
  const request = http.get('http://localhost:9876')
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
  expect(errorListener).not.toHaveBeenCalled()
})

it('forwards ECONNREFUSED error given a bypassed request', async () => {
  const errorPromise = new DeferredPromise<ConnectionError>()
  const responseListener = vi.fn()

  // Connecting to a non-existing host will
  // result in the "ECONNREFUSED" error in Node.js.
  // In this case, nothing is handling a response for this
  // request, so the connection error must be forwarded.
  const request = http.get('http://localhost:9876')
  request.on('error', (error: ConnectionError) => {
    errorPromise.resolve(error)
  })
  request.on('response', responseListener)

  const requestError = await errorPromise

  /**
   * @note Don't assert exact error address/port
   * because Node.js v20 will aggreggate connection errors
   * into a single "AggregateError" instance that doesn't have those.
   */
  expect(requestError.code).toBe('ECONNREFUSED')
  expect(responseListener).not.toHaveBeenCalled()
})

it('suppresses ENOTFOUND error given a mocked response', async () => {
  interceptor.once('request', async ({ request }) => {
    await sleep(250)
    request.respondWith(new Response('Mocked'))
  })

  const request = http.get('https://non-existing-url.com')
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
  expect(errorListener).not.toHaveBeenCalled()
})

it('forwards ENOTFOUND error for a bypassed request', async () => {
  const request = http.get('https://non-existing-url.com')
  const errorPromise = new DeferredPromise<NotFoundError>()
  request.on('error', (error: NotFoundError) => {
    errorPromise.resolve(error)
  })
  const responseListener = vi.fn()
  request.on('response', responseListener)

  const requestError = await errorPromise

  expect(requestError.code).toBe('ENOTFOUND')
  expect(requestError.hostname).toBe('non-existing-url.com')
  expect(responseListener).not.toHaveBeenCalled()
})

it('suppresses EHOSTUNREACH error given a mocked response', async () => {
  interceptor.once('request', async ({ request }) => {
    await sleep(250)
    request.respondWith(new Response('Mocked'))
  })

  // Connecting to an IPv6 address that's out of the network's
  // reach will result in the "EHOSTUNREACH" error in Node.js.
  const request = http.get('http://[2607:f0d0:1002:51::4]')
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('Mocked')
})

it('forwards EHOSTUNREACH error for a bypassed request', async () => {
  // Connecting to an IPv6 address that's out of the network's
  // reach will result in the "EHOSTUNREACH" error in Node.js.
  const request = http.get('http://[2607:f0d0:1002:51::4]')
  const errorPromise = new DeferredPromise<ConnectionError>()
  request.on('error', (error: ConnectionError) => {
    errorPromise.resolve(error)
  })

  const requestError = await errorPromise

  /**
   * @note On Ubuntu, requesting an unreachable host
   * results in the "ENETUNREACH" error instead of "EHOSTUNREACH"
   */
  expect(requestError.code).toMatch(/^(EHOSTUNREACH|ENETUNREACH)$/)
  expect(requestError.address).toBe('2607:f0d0:1002:51::4')
  expect(requestError.port).toBe(80)
})

it('allows throwing connection errors in the request listener', async () => {
  class ConnectionRefusedError extends Error implements ConnectionError {
    code?: string
    errno?: number
    syscall?: string

    constructor(public address: string, public port: number) {
      super()
      this.code = 'ECONNREFUSED'
      this.errno = -61
      this.syscall = 'connect'
      this.message = `${this.syscall} ${this.code} ${this.address} ${this.port}`
    }
  }

  interceptor.on('request', async () => {
    await sleep(250)

    // A connection error thrown in the request listener
    // will not be suppressed, and will forward to the consumer.
    throw new ConnectionRefusedError('::1', 4444)
  })

  const request = http.get('http://localhost')
  const errorPromise = new DeferredPromise<ConnectionError>()
  request.on('error', (error: ConnectionError) => {
    errorPromise.resolve(error)
  })

  const requestError = await errorPromise

  expect(requestError.message).toBe('connect ECONNREFUSED ::1 4444')
  expect(requestError.code).toBe('ECONNREFUSED')
  expect(requestError.address).toBe('::1')
  expect(requestError.port).toBe(4444)
})
