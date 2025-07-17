import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

/**
 * @see https://github.com/mswjs/interceptors/pull/724
 */
it('responds with mocked headers defined using the Headers class', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: new Headers({
          'content-encoding': 'gzip',
          'x-custom-header': 'yes',
        }),
      })
    )
  })

  const response = await fetch('http://localhost/')
  expect(response.headers.get('content-encoding')).toBe('gzip')
  expect(response.headers.get('x-custom-header')).toBe('yes')
})
