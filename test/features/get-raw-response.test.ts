// @vitest-environment jsdom
import { it, expect, afterAll, afterEach, beforeAll } from 'vitest'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor, getRawRequest, getRawResponse } from '../../src'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../../src/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '../../src/interceptors/fetch'
import { createXMLHttpRequest, waitForClientRequest } from '../helpers'

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('returns a reference to a raw http.IncomingMessage instance', async () => {
  const rawResponsePromise = new DeferredPromise<http.IncomingMessage | null>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(null, { headers: { 'Content-Type': 'text/plain' } }))
  })

  interceptor.on('response', ({ request }) => {
    const rawRequest = getRawRequest(request) as http.ClientRequest

    rawRequest.on('response', rawResponsePromise.resolve)
  })

  const req = http.get('http://localhost')
  await waitForClientRequest(req)
  const rawResponse = await rawResponsePromise
  expect(rawResponse).toBeInstanceOf(http.IncomingMessage)
})