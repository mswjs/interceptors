// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/msw/issues/2307
 */
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { FetchResponse } from '#/src/utils/fetchUtils'
import { waitForXMLHttpRequest, useCors } from '#/test/helpers'

const interceptor = new XMLHttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.use(useCors)
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

  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/resource'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(101)
  expect(request.statusText).toBe('Switching Protocols')
  expect(request.responseText).toBe('')

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

  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/resource'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(101)
  expect(request.responseText).toBe('')

  // Must expose the exact response in the listener.
  await expect(responsePromise).resolves.toHaveProperty('status', 101)
})
