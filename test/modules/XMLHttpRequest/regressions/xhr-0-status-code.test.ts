// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/335
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('handles Response.error() as a request error', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const loadListener = vi.fn()
  const errorListener = vi.fn()
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.addEventListener('load', loadListener)
    request.addEventListener('error', errorListener)
    request.send()
  })

  expect(request.status).toBe(0)
  expect(request.readyState).toBe(4)
  expect(request.response).toBe('')
  expect(loadListener).not.toBeCalled()
  expect(errorListener).toHaveBeenCalledTimes(1)
})

it('handles interceptor exceptions as 500 error responses', async () => {
  interceptor.once('request', () => {
    throw new Error('Network error')
  })

  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost')
    request.send()
  })

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.readyState).toBe(4)
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})
