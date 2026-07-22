/**
 * @vitest-environment node
 * @note This test is intentionally omitted in the test run.
 * It's meant to be spawned in a child process by the actual test
 * that asserts that this one doesn't leave the Jest runner hanging
 * due to the unterminated socket.
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(new Response('hello world', { status: 301 }))
})

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('must-not-reach-server', { status: 500 })
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports custom socket timeout on the HTTP request', async () => {
  const responseReceived = Promise.withResolvers<http.IncomingMessage>()
  const request = http.request(
    httpServer.http.url('/resource').href,
    (response) => {
      response.on('data', () => null)
      response.on('end', () => responseReceived.resolve(response))
    }
  )

  // Intentionally large request timeout.
  request.setTimeout(10_000)
  request.end()

  const response = await responseReceived.promise
  expect(response.statusCode).toBe(301)
})
