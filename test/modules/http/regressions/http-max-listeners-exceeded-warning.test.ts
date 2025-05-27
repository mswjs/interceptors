// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/pull/706
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    // Triggers 2 reads in the MockHttpSocket
    res.write('hello')
    res.flushHeaders()
    res.write(' world')
    res.end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not buffer socket pushes for a passthrough request', async () => {
  const request = http.get(httpServer.http.url('/'))
  const { text } = await waitForClientRequest(request)

  await expect(text()).resolves.toBe('hello world')
  expect(
    request.socket?.listenerCount('connect'),
    'Must not add "connection" listeners to the socket. Those listeners mean no "_handle" exists on the mock socket.'
  ).toBe(0)
})
