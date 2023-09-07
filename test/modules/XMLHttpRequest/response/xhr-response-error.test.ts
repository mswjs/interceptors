// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll, vi } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ request }) => {
  request.respondWith(Response.error())
})

beforeAll(async () => {
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
})

it('treats "Response.error()" as request error', async () => {
  const requestErrorListener = vi.fn()

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost:3001/resource')
    request.addEventListener('error', requestErrorListener)
    request.send()
  })

  // Request must reflect the request error state.
  expect(request.readyState).toBe(request.DONE)
  expect(request.status).toBe(0)
  expect(request.statusText).toBe('')
  expect(request.response).toBe('')

  // Network error must propagate to the "error" request event.
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})
