/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { performance } from 'node:perf_hooks'
import http from 'node:http'
import https from 'node:https'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'

type ResponseChunks = Array<{ buffer: Buffer; timestamp: number }>

const encoder = new TextEncoder()

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
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

it('supports delays when enqueuing chunks', async () => {
  interceptor.once('request', ({ request }) => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first'))
        await sleep(200)

        controller.enqueue(encoder.encode('second'))
        await sleep(200)

        controller.enqueue(encoder.encode('third'))
        await sleep(200)

        controller.close()
      },
    })

    request.respondWith(
      new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
        },
      })
    )
  })

  const responseChunksPromise = new DeferredPromise<ResponseChunks>()

  const request = https.get('https://api.example.com/stream', (response) => {
    const chunks: ResponseChunks = []

    response
      .on('data', (data) => {
        chunks.push({
          buffer: Buffer.from(data),
          timestamp: performance.now(),
        })
      })
      .on('end', () => {
        responseChunksPromise.resolve(chunks)
      })
      .on('error', responseChunksPromise.reject)
  })

  request.on('error', responseChunksPromise.reject)

  const responseChunks = await responseChunksPromise
  const textChunks = responseChunks.map((chunk) => {
    return chunk.buffer.toString('utf8')
  })
  expect(textChunks).toEqual(['first', 'second', 'third'])

  // Ensure that the chunks were sent over time,
  // respecting the delay set in the mocked stream.
  const chunkTimings = responseChunks.map((chunk) => chunk.timestamp)
  expect(chunkTimings[1] - chunkTimings[0]).toBeGreaterThanOrEqual(150)
  expect(chunkTimings[2] - chunkTimings[1]).toBeGreaterThanOrEqual(150)
})

it('forwards ReadableStream errors to the request', async () => {
  const requestErrorListener = vi.fn()
  const responseErrorListener = vi.fn()

  interceptor.once('request', ({ request }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('original'))
        queueMicrotask(() => {
          controller.error(new Error('stream error'))
        })
      },
    })
    request.respondWith(new Response(stream))
  })

  const request = http.get('http://localhost/resource')
  request.on('error', requestErrorListener)
  request.on('response', (response) => {
    response.on('error', responseErrorListener)
  })

  const response = await vi.waitFor(() => {
    return new Promise<http.IncomingMessage>((resolve) => {
      request.on('response', resolve)
    })
  })

  // Response stream errors are translated to unhandled exceptions,
  // and then the server decides how to handle them. This is often
  // done as returning a 500 response.
  expect(response.statusCode).toBe(500)
  expect(response.statusMessage).toBe('Unhandled Exception')

  // Response stream errors are not request errors.
  expect(requestErrorListener).not.toHaveBeenCalled()
  expect(request.destroyed).toBe(false)
})
