/**
 * @note Historically, we used to intercept "ClientRequest" via a custom agent.
 * With the socket-based interception, that's no longer the case. I've rewritten
 * this test suite to ensure we are *not* patching the agents anymore.
 */
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

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

it('does not patch the agent for the HTTP request', async () => {
  const socketPromise = new DeferredPromise<net.Socket>()
  const request = http
    .get('http://localhost/does-not-matter')
    .on('socket', (socket) => socketPromise.resolve(socket as net.Socket))
    .on('error', () => {})

  expect(Reflect.get(request, 'agent')).toBeInstanceOf(http.Agent)
  await expect(socketPromise).resolves.toBeInstanceOf(net.Socket)
})

it('does not patch the agent for the HTTPS request', async () => {
  const socketPromise = new DeferredPromise<net.Socket>()
  const request = https
    .get('https://localhost/does-not-matter')
    .on('socket', (socket) => socketPromise.resolve(socket as net.Socket))
    .on('error', () => {})

  expect(Reflect.get(request, 'agent')).toBeInstanceOf(https.Agent)
  await expect(socketPromise).resolves.toBeInstanceOf(net.Socket)
})
