// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import https from 'node:https'
import { TLSSocket } from 'node:tls'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits a correct TLS Socket instance for a handled HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response())
  })

  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise

  expect.soft(socket).toBeInstanceOf(TLSSocket)

  // Must be a TLS socket.
  expect.soft(socket.encrypted).toBe(true)
  expect.soft(socket.authorized, 'Must not have signed certificate').toBe(false)

  expect.soft(socket.getSession()).toBeUndefined()
  expect.soft(socket.getProtocol()).toBe('TLSv1.3')
  expect.soft(socket.isSessionReused()).toBe(false)
})

it('emits a correct TLS Socket instance for a bypassed HTTPS request', async () => {
  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise

  expect.soft(socket).toBeInstanceOf(TLSSocket)

  expect.soft(socket.encrypted).toBe(true)
  expect.soft(socket.authorized, 'Must not have signed certificate').toBe(false)

  expect.soft(socket.getSession()).toBeUndefined()
  expect.soft(socket.getProtocol()).toBe('TLSv1.3')
  expect.soft(socket.isSessionReused()).toBe(false)
})
