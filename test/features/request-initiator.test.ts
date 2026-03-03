// @vitest-environment jsdom
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor } from '#/src/BatchInterceptor'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest/node'
import { FetchInterceptor } from '#/src/interceptors/fetch/node'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse, waitForXMLHttpRequest } from '#/test/helpers'

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
  const [response] = await toWebResponse(request)

  await expect(initiatorPromise).resolves.toEqual(request)
  await expect(response.text()).resolves.toBe('mocked')
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

  const request = new XMLHttpRequest()
  request.open('GET', 'http://localhost/api')
  request.send()

  await waitForXMLHttpRequest(request)

  await expect(initiatorPromise).resolves.toEqual(request)
  expect(request.responseText).toBe('mocked')
})

it('exposes the initiator of a mocked fetch request', async () => {
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

  /**
   * @note Use "toMatchObject" instead of "toEqual" to ignore the difference
   * in internal symbols on the request, which Undici modifies after "fetch".
   */
  await expect(initiatorPromise).resolves.toMatchObject(request)
  await expect(response.text()).resolves.toBe('mocked')
})
