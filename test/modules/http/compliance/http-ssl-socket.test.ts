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
  expect(socket.getCipher()).toEqual({ name: 'AES256-SHA', standardName: 'TLS_RSA_WITH_AES_256_CBC_SHA', version: 'TLSv1.3' })
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
  expect(socket.getCipher()).toEqual({ name: 'AES256-SHA', standardName: 'TLS_RSA_WITH_AES_256_CBC_SHA', version: 'TLSv1.3' })
})
