/**
 * @vitest-environment node
 * @note This test is intentionally omitted in the test run.
 * It's meant to be spawned in a child process by the actual test
 * that asserts that this one doesn't leave the Jest runner hanging
 * due to the unterminated socket.
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http, { IncomingMessage } from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.status(500).send('must-not-reach-server')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(new Response('hello world', { status: 301 }))
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports custom socket timeout on the HTTP request', async () => {
  const responseReceived = new DeferredPromise<IncomingMessage>()
  const request = http.request(httpServer.http.url('/resource'), (response) => {
    response.on('data', () => null)
    response.on('end', () => responseReceived.resolve(response))
  })

  // Intentionally large request timeout.
  request.setTimeout(10_000)
  request.end()

  const response = await responseReceived
  expect(response.statusCode).toBe(301)
})
