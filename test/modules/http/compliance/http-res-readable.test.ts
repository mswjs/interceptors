/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports ReadableStream as a mocked response', async () => {
  const encoder = new TextEncoder()
  interceptor.once('request', ({ request }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('hello'))
        controller.enqueue(encoder.encode(' '))
        controller.enqueue(encoder.encode('world'))
        controller.close()
      },
    })
    request.respondWith(new Response(stream))
  })

  const request = http.get('http://example.com/resource')
  const { text } = await waitForClientRequest(request)
  expect(await text()).toBe('hello world')
})

it('forwards ReadableStream errors to the request', async () => {
  const responseListener = vi.fn()
  const endListener = vi.fn()
  interceptor.once('request', ({ request }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.error(new Error('stream error'))
      },
    })
    request.respondWith(new Response(stream))
  })

  const request = http.get('http://example.com/resource')
  request.on('response', responseListener)
  request.on('end', endListener)

  const requestError = await vi.waitFor(() => {
    return new Promise<Error>((resolve) => {
      request.on('error', resolve)
    })
  })

  expect(requestError).toEqual(new Error('stream error'))
  expect(responseListener).not.toHaveBeenCalled()
  expect(endListener).not.toHaveBeenCalled()
})
