// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import https from 'node:https'
import type { TLSSocket } from 'node:tls'
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
    controller.respondWith(new Response('hello world'))
  })

  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise

  // Must be a TLS socket.
  expect(socket.encrypted).toBe(true)
  // The server certificate wasn't signed by one of the CA
  // specified in the Socket constructor.
  expect(socket.authorized).toBe(false)

  expect(socket.getSession()).toBeUndefined()
  expect(socket.getProtocol()).toBe('TLSv1.3')
  expect(socket.isSessionReused()).toBe(false)
})

it('emits a correct TLS Socket instance for a bypassed HTTPS request', async () => {
  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise

  // Must be a TLS socket.
  expect(socket.encrypted).toBe(true)
  // The server certificate wasn't signed by one of the CA
  // specified in the Socket constructor.
  expect(socket.authorized).toBe(false)

  expect(socket.getSession()).toBeUndefined()
  expect(socket.getProtocol()).toBe('TLSv1.3')
  expect(socket.isSessionReused()).toBe(false)
})
