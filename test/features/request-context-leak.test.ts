// @vitest-environment happy-dom
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest/node'
import { FetchInterceptor } from '#/src/interceptors/fetch/node'
import { createTestServer, toWebResponse } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const fetchInterceptor = new FetchInterceptor()
const clientRequestInterceptor = new ClientRequestInterceptor()
const xmlHttpRequestInterceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  fetchInterceptor.apply()
  clientRequestInterceptor.apply()
  xmlHttpRequestInterceptor.apply()
})

afterEach(() => {
  fetchInterceptor.removeAllListeners()
  clientRequestInterceptor.removeAllListeners()
  xmlHttpRequestInterceptor.removeAllListeners()
})

afterAll(() => {
  fetchInterceptor.dispose()
  clientRequestInterceptor.dispose()
  xmlHttpRequestInterceptor.dispose()
})

it('does not attribute a ClientRequest to a preceding fetch request', async () => {
  await using server = await createTestServer(() => {
    return http.createServer((_request, response) => {
      response.end('original')
    })
  })

  const fetchRequestListener = vi.fn<(url: string) => void>()
  fetchInterceptor.on('request', ({ request, controller }) => {
    fetchRequestListener(request.url)

    if (request.url === 'http://localhost/mocked') {
      controller.respondWith(new Response('mocked'))
    }
  })

  const clientRequestInitiator = new DeferredPromise<unknown>()
  clientRequestInterceptor.on('request', ({ initiator }) => {
    clientRequestInitiator.resolve(initiator)
  })

  await expect(
    fetch('http://localhost/mocked').then((response) => response.text())
  ).resolves.toBe('mocked')

  /**
   * @note An unrelated request performed after `fetch()` in the same
   * asynchronous scope. It must not inherit the fetch request as its
   * initiator and must not be routed to the fetch interceptor.
   */
  const request = http.get(server.http.url('/resource').href)
  const [response] = await toWebResponse(request)

  expect(fetchRequestListener).toHaveBeenCalledTimes(1)
  expect(fetchRequestListener).toHaveBeenCalledWith('http://localhost/mocked')

  await expect(clientRequestInitiator).resolves.toEqual(request)
  await expect(response.text()).resolves.toBe('original')
})

it('does not attribute a ClientRequest to a preceding XMLHttpRequest', async () => {
  await using server = await createTestServer(() => {
    return http.createServer((_request, response) => {
      response.end('original')
    })
  })

  const xhrRequestListener = vi.fn<(url: string) => void>()
  xmlHttpRequestInterceptor.on('request', ({ request, controller }) => {
    xhrRequestListener(request.url)

    if (request.url === 'http://localhost/mocked') {
      controller.respondWith(
        new Response('mocked', {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        })
      )
    }
  })

  const clientRequestInitiator = new DeferredPromise<unknown>()
  clientRequestInterceptor.on('request', ({ initiator }) => {
    clientRequestInitiator.resolve(initiator)
  })

  const xmlHttpRequest = new XMLHttpRequest()
  xmlHttpRequest.open('GET', 'http://localhost/mocked')
  xmlHttpRequest.send()
  await waitForXMLHttpRequest(xmlHttpRequest)
  expect(xmlHttpRequest.responseText).toBe('mocked')

  /**
   * @note An unrelated request performed after the XMLHttpRequest in
   * the same asynchronous scope. It must not inherit that request as
   * its initiator and must not be routed to the XHR interceptor.
   */
  const request = http.get(server.http.url('/resource').href)
  const [response] = await toWebResponse(request)

  expect(xhrRequestListener).toHaveBeenCalledTimes(1)
  expect(xhrRequestListener).toHaveBeenCalledWith('http://localhost/mocked')

  await expect(clientRequestInitiator).resolves.toEqual(request)
  await expect(response.text()).resolves.toBe('original')
})
