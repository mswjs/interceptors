// @vitest-environment node
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { FetchInterceptor } from '#/src/interceptors/fetch/web'
import { FetchResponse } from '#/src/utils/fetchUtils'

const interceptor = new FetchInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.writeHead(101, 'Switching Protocols')
    res.set('connection', 'upgrade')
    res.set('upgrade', 'HTTP/2.0')
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
  const responseListener = vi.fn()
  interceptor.on('response', responseListener)

  // Fetch doesn't handle 101 responses by spec.
  await expect(fetch(httpServer.http.url('/resource'))).rejects.toThrow(
    'fetch failed'
  )

  // Must not call the response listener. Fetch failed.
  expect(responseListener).not.toHaveBeenCalled()
})

it('supports mocking non-configurable responses', async () => {
  interceptor.on('request', ({ controller }) => {
    /**
     * @note The Fetch API `Response` will still error on
     * non-configurable status codes. Instead, use this helper class.
     */
    controller.respondWith(
      new FetchResponse(null, {
        status: 101,
        statusText: 'Switching Protocols',
      })
    )
  })

  const responsePromise = new DeferredPromise<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })

  const response = await fetch('http://localhost/irrelevant')

  expect.soft(response.status).toBe(101)
  expect.soft(response.statusText).toBe('Switching Protocols')

  // Must expose the exact response in the listener.
  await expect(responsePromise).resolves.toHaveProperty('status', 101)
})
