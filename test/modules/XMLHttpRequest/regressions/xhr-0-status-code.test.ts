// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/335
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../lib/node/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', () => {
  throw new Error('Network error')
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('does not construct a Response when the request fails', async () => {
  const responseListener = vi.fn()
  const loadListener = vi.fn()
  const errorListener = vi.fn()

  interceptor.on('response', responseListener)

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.addEventListener('load', loadListener)
    request.addEventListener('error', errorListener)
    request.send()
  })

  expect(request.status).toBe(0)
  expect(request.statusText).toBe('')
  expect(request.readyState).toBe(4)
  expect(responseListener).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
  expect(errorListener).toHaveBeenCalledTimes(1)
})
