/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import https from 'node:https'
import type { TLSSocket } from 'node:tls'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

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
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('hello world'))
  })

  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', (socket) => {
    socket.on('connect', () => socketPromise.resolve(socket as TLSSocket))
  })

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
  request.on('socket', (socket) => {
    socket.on('connect', () => socketPromise.resolve(socket as TLSSocket))
  })

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
