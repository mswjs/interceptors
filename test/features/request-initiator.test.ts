// @vitest-environment jsdom
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor } from '../../src/BatchInterceptor'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest/new'
import { XMLHttpRequestInterceptor } from '../../src/interceptors/XMLHttpRequest/new'
import { FetchInterceptor } from '../../src/interceptors/fetch/node'
import { HttpRequestInterceptor } from '../../src/interceptors/http'
import { createXMLHttpRequest, waitForClientRequest } from '../helpers'

const interceptor = new BatchInterceptor({
  name: 'interceptor',
  interceptors: [
    new HttpRequestInterceptor(),
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

it('exposes the initiator of a mocked ClientRequest request', async () => {
  const initiatorPromise = new DeferredPromise<XMLHttpRequest>()
  interceptor.on('request', ({ initiator, controller }) => {
    initiatorPromise.resolve(initiator as XMLHttpRequest)
    controller.respondWith(new Response('mocked'))
  })

  const request = http.get('http://localhost:3001/api')
  const { text } = await waitForClientRequest(request)

  await expect(initiatorPromise).resolves.toEqual(request)
  await expect(text()).resolves.toBe('mocked')
})

it('exposes the initiator of a mocked XMLHttpRequest request', async () => {
  const initiatorPromise = new DeferredPromise<XMLHttpRequest>()
  interceptor.on('request', ({ initiator, controller }) => {
    initiatorPromise.resolve(initiator as XMLHttpRequest)

    controller.respondWith(
      new Response('mocked', {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    )
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost/api')
    request.send()
  })

  await expect(initiatorPromise).resolves.toEqual(request)
  expect.soft(request.responseText).toBe('mocked')
})

/**
 * @fixme HttpRequestInterceptor doesn't support global `fetch` (Undici) right now.
 * Once it does, this test will pass.
 */
it.skip('exposes the initiator of a mocked fetch request', async () => {
  const initiatorPromise = new DeferredPromise<XMLHttpRequest>()
  interceptor.on('request', ({ initiator, controller }) => {
    initiatorPromise.resolve(initiator as XMLHttpRequest)

    controller.respondWith(
      new Response('mocked', {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    )
  })

  const request = new Request('http://localhost/api')
  const response = await fetch(request)

  await expect(initiatorPromise).resolves.toEqual(request)
})
