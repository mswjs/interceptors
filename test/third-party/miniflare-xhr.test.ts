// @vitest-environment miniflare
import { afterAll, expect, test } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../src/interceptors/XMLHttpRequest'

let interceptor: XMLHttpRequestInterceptor

afterAll(() => {
  interceptor.dispose()
})

test('does not throw when applying XHR interceptor in Miniflare', async () => {
  interceptor = new XMLHttpRequestInterceptor()

  /**
   * @note Miniflare (Cloudflare) does not implement XMLHttpRequest.
   * We must make sure we can still apply the XHR interceptor without it
   * throwing an error. Interceptors check the environment before applying.
   */
  expect(() => interceptor.apply()).not.toThrow()
})
