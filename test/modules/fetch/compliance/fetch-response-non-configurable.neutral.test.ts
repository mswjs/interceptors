import { DeferredPromise } from '@open-draft/deferred-promise'
import { FetchResponse } from '@mswjs/interceptors'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const IS_BROWSER = typeof window !== 'undefined'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

/**
 * @note Chromium stalls a fetch request that receives an actual
 * "101 Switching Protocols" response, awaiting the protocol upgrade.
 * There is no fetch-level failure to observe in the browser.
 */
it.skipIf(IS_BROWSER)('handles non-configurable responses from the actual server', async () => {
  const responseListener = vi.fn()
  interceptor.on('response', responseListener)

  // Fetch doesn't handle 101 responses by spec.
  await expect(fetch(server.http.url('/switching-protocols'))).rejects.toThrow(
    'fetch failed'
  )

  // Must not call the response listener. Fetch failed.
  expect(responseListener).not.toHaveBeenCalled()
})

/**
 * @note In Node.js, the mocked response is received over the wire
 * where fetch (Undici) correctly treats "101 Switching Protocols"
 * as a network error, as per the Fetch specification. Mocking
 * non-configurable responses is only supported in the browser,
 * where the interceptor resolves the mocked response directly.
 */
it.skipIf(!IS_BROWSER)('supports mocking non-configurable responses', async () => {
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
