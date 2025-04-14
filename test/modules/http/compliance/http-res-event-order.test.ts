// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'

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

it('should fire response event before waiting for the response body', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('hello world'))
          controller.close()
        }, 100)
      },
    })
    controller.respondWith(new Response(stream))
  })

  const responseReceived = new DeferredPromise<number>()

  http.get('http://localhost', (response) => {
    const start = Date.now()
    response.on('data', () => {
      responseReceived.resolve(Date.now() - start)
    })
  })

  expect(await responseReceived).toBeGreaterThan(100)
})
