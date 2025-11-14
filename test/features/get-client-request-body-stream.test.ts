// @vitest-environment node
import http from 'node:http'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { afterAll, afterEach, beforeAll, it, expect } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor } from '../../src'
import interceptors from '../../src/presets/node'
import { getClientRequestBodyStream } from '../../src/utils/node'
import { waitForClientRequest } from '../helpers'

const interceptor = new BatchInterceptor({
  name: 'interceptor',
  interceptors,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('returns the underlying request body stream for http.ClientRequest', async () => {
  const requestBodyStreamPromise = new DeferredPromise<Readable>()

  interceptor.on('request', ({ request, controller }) => {
    try {
      const requestBodyStream = getClientRequestBodyStream(request)
      requestBodyStreamPromise.resolve(requestBodyStream)
    } catch (error) {
      requestBodyStreamPromise.reject(error)
    }

    controller.respondWith(new Response())
  })

  const request = http.request('http://localhost:3000/resource', {
    method: 'GET',
    headers: {
      /**
       * @note The `content-length` header is required to send payload in a GET request.
       */
      'content-length': '11',
    },
  })
  request.write('hello world')
  request.end()

  await waitForClientRequest(request)
  const requestBodyStream = await requestBodyStreamPromise
  expect(requestBodyStream).toBeInstanceOf(Readable)

  await expect(text(requestBodyStream)).resolves.toBe('hello world')
})

it('throws if the request is not an instance of http.ClientRequest', async () => {
  const requestBodyStreamPromise = new DeferredPromise<Readable>()

  interceptor.on('request', ({ request, controller }) => {
    try {
      const requestBodyStream = getClientRequestBodyStream(request)
      requestBodyStreamPromise.resolve(requestBodyStream)
    } catch (error) {
      requestBodyStreamPromise.reject(error)
    }

    controller.respondWith(new Response())
  })

  fetch('http://localhost:3000/resource', {
    method: 'POST',
    body: 'hello world',
  })

  await expect(requestBodyStreamPromise).rejects.toThrow(
    `Failed to retrieve raw request body stream: request is not an instance of "http.ClientRequest". Note that you can only use the "getClientRequestBodyStream" function with the requests issued by "http.clientRequest".`
  )
})
