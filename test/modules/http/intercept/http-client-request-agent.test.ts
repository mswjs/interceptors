/**
 * @note This test suite makes sure that us patching both `ClientRequest`
 * and `http.*`/`https.*` request-issuing methods that create that `ClientRequest`
 * does not result in duplicate mock HTTP sockets/agents being created.
 */
import { beforeAll, afterEach, afterAll, it, expect } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { DeferredPromise } from '@open-draft/deferred-promise'
import type { MockHttpSocket } from '../../../../src/interceptors/ClientRequest/MockHttpSocket'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import {
  MockAgent,
  MockHttpsAgent,
} from '../../../../src/interceptors/ClientRequest/agents'

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

it('reuses the same mock socket for an HTTP ClientRequest and its agent', async () => {
  const socketPromise = new DeferredPromise<MockHttpSocket>()
  const request = http
    .get('http://localhost/does-not-matter')
    .on('socket', (socket) => socketPromise.resolve(socket as MockHttpSocket))
    .on('error', () => {})

  const requestAgent = Reflect.get(request, 'agent') as http.Agent
  expect(requestAgent).toBeInstanceOf(MockAgent)

  const socket = await socketPromise
  expect(
    socket['connectionOptions'].agent,
    'Request agent must equal to the socket agent'
  ).toEqual(requestAgent)
})

it('reuses the same mock socket for an HTTPS ClientRequest and its agent', async () => {
  const socketPromise = new DeferredPromise<MockHttpSocket>()
  const request = https
    .get('https://localhost/does-not-matter')
    .on('socket', (socket) => socketPromise.resolve(socket as MockHttpSocket))
    .on('error', () => {})

  const requestAgent = Reflect.get(request, 'agent') as https.Agent
  expect(requestAgent).toBeInstanceOf(MockHttpsAgent)

  const socket = await socketPromise
  expect(
    socket['connectionOptions'].agent,
    'Request agent must equal to the socket agent'
  ).toEqual(requestAgent)
})
