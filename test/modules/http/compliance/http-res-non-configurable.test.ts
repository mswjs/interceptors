// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2307
 */
import http from 'node:http'
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { FetchResponse } from '../../../../src/utils/fetchUtils'
import { waitForClientRequest } from '../../../helpers'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.writeHead(101, 'Switching Protocols')
    res.end()
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles non-configurable responses from the actual server', async () => {
  const responsePromise = new DeferredPromise<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })

  const request = http.get(httpServer.http.url('/resource'))
  const { res } = await waitForClientRequest(request)

  // Must passthrough non-configurable responses
  // (i.e. those that cannot be created using the Fetch API).
  expect(res.statusCode).toBe(101)
  expect(res.statusMessage).toBe('Switching Protocols')

  // Must expose the exact response in the listener.
  await expect(responsePromise).resolves.toHaveProperty('status', 101)
})

it('supports mocking non-configurable responses', async () => {
  interceptor.on('request', ({ controller }) => {
    /**
     * @note The Fetch API `Response` will still error on
     * non-configurable status codes. Instead, use this helper class.
     */
    controller.respondWith(new FetchResponse(null, { status: 101 }))
  })

  const responsePromise = new DeferredPromise<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })

  const request = http.get('http://localhost/irrelevant')
  const { res } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(101)

  // Must expose the exact response in the listener.
  await expect(responsePromise).resolves.toHaveProperty('status', 101)
})
