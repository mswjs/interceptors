// @vitest-environment node
import http from 'node:http'
import type { LookupFunction } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

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

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('suppresses ECONNREFUSED error given a mocked response', async () => {
  interceptor.once('request', async ({ controller }) => {
    await setTimeout(250)
    controller.respondWith(new Response('mocked'))
  })

  // Connecting to a non-existing host will
  // result in the "ECONNREFUSED" error in Node.js.
  const request = http.get('http://localhost:9876')
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
  expect(errorListener).not.toHaveBeenCalled()
})

it('forwards ECONNREFUSED error given a bypassed request', async () => {
  const errorPromise = Promise.withResolvers<ConnectionError>()
  const responseListener = vi.fn()

  // Connecting to a non-existing host will
  // result in the "ECONNREFUSED" error in Node.js.
  // In this case, nothing is handling a response for this
  // request, so the connection error must be forwarded.
  const request = http.get('http://localhost/non-existing')
  request
    .on('error', (error: ConnectionError) => {
      errorPromise.resolve(error)
    })
    .on('response', responseListener)

  const requestError = await errorPromise.promise

  /**
   * @note Don't assert exact error address/port
   * because Node.js v20 will aggregate connection errors
   * into a single "AggregateError" instance that doesn't have those.
   */
  expect.soft(requestError.code).toBe('ECONNREFUSED')
  expect.soft(responseListener).not.toHaveBeenCalled()
})

it('suppresses ENOTFOUND error given a mocked response', async () => {
  interceptor.once('request', async ({ controller }) => {
    await setTimeout(250)
    controller.respondWith(new Response('mocked'))
  })

  const request = http.get('http://non-existing-url.com')
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
  expect(errorListener).not.toHaveBeenCalled()
})

it('forwards ENOTFOUND error for a bypassed request', async () => {
  const request = http.get('http://non-existing-url.com')
  const errorPromise = Promise.withResolvers<NotFoundError>()
  request.on('error', (error: NotFoundError) => {
    errorPromise.resolve(error)
  })
  const responseListener = vi.fn()
  request.on('response', responseListener)

  const requestError = await errorPromise.promise

  expect(requestError.code).toBe('ENOTFOUND')
  expect(requestError.hostname).toBe('non-existing-url.com')
  expect(responseListener).not.toHaveBeenCalled()
})

function createUnreachableLookup() {
  const error: ConnectionError = Object.assign(
    new Error('connect EHOSTUNREACH 2607:f0d0:1002:51::4:80'),
    { code: 'EHOSTUNREACH', address: '2607:f0d0:1002:51::4', port: 80 }
  )

  // Supply a deterministic error through the real connection's lookup option.
  // A public IPv6 address can time out or be reachable depending on host routing.
  const lookup = vi.fn<LookupFunction>((_hostname, _options, callback) => {
    process.nextTick(() => callback(error, '', 6))
  })

  return { error, lookup }
}

it('suppresses EHOSTUNREACH error given a mocked response', async () => {
  interceptor.once('request', async ({ controller }) => {
    await setTimeout(250)
    controller.respondWith(new Response('mocked'))
  })

  const { lookup } = createUnreachableLookup()
  const request = http.get('http://unreachable.test', { lookup })
  onTestFinished(() => {
    request.destroy()
  })
  const errorListener = vi.fn()
  request.on('error', errorListener)

  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
  expect(errorListener).not.toHaveBeenCalled()
  expect(lookup).not.toHaveBeenCalled()
})

it('forwards EHOSTUNREACH error for a bypassed request', async () => {
  const { error, lookup } = createUnreachableLookup()
  const request = http.get('http://unreachable.test', { lookup })
  onTestFinished(() => {
    request.destroy()
  })
  const errorPromise = Promise.withResolvers<ConnectionError>()
  request.on('error', (error: ConnectionError) => {
    errorPromise.resolve(error)
  })
  const responseListener = vi.fn()
  request.on('response', responseListener)

  const requestError = await errorPromise.promise

  expect(lookup).toHaveBeenCalledOnce()
  expect(requestError).toBe(error)
  expect(requestError.code).toBe('EHOSTUNREACH')
  expect(requestError.address).toBe('2607:f0d0:1002:51::4')
  expect(requestError.port).toBe(80)
  expect(responseListener).not.toHaveBeenCalled()
})

it('allows throwing connection errors in the request listener', async () => {
  class ConnectionRefusedError extends Error implements ConnectionError {
    code?: string
    errno?: number
    syscall?: string

    constructor(
      public address: string,
      public port: number
    ) {
      super()
      this.code = 'ECONNREFUSED'
      this.errno = -61
      this.syscall = 'connect'
      this.message = `${this.syscall} ${this.code} ${this.address} ${this.port}`
    }
  }

  interceptor.on('request', async () => {
    await setTimeout(250)

    // A connection error thrown in the request listener
    // will not be suppressed, and will forward to the consumer.
    throw new ConnectionRefusedError('::1', 4444)
  })

  const request = http.get('http://localhost')
  const errorPromise = Promise.withResolvers<ConnectionError>()
  request.on('error', (error: ConnectionError) => {
    errorPromise.resolve(error)
  })

  const requestError = await errorPromise.promise

  expect(requestError).toMatchObject({
    code: 'ECONNREFUSED',
    address: '::1',
    port: 4444,
  })
})
