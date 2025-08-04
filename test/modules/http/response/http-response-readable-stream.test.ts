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
  const chunks = ['hello', ' ', 'world']
  interceptor.once('request', ({ controller }) => {
    const stream = new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift()
        if (chunk) {
          controller.enqueue(encoder.encode(chunk))
        } else {
          controller.close()
        }
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://example.com/resource')
  const { text } = await waitForClientRequest(request)
  expect(await text()).toBe('hello world')
})

it('supports delays when enqueuing chunks', async () => {
  interceptor.once('request', ({ controller }) => {
    const chunks = ['first', 'second', 'third']
    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()
        await sleep(200)
        if (chunk) {
          controller.enqueue(encoder.encode(chunk))
        } else {
          controller.close()
        }
      },
    })

    controller.respondWith(
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
  const chunks = ['first', 'second', 'third']

  interceptor.once('request', ({ controller }) => {
    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()
        await sleep(200)
        if (chunk) {
          controller.enqueue(encoder.encode(chunk))
        } else {
          controller.error(new Error('stream error'))
        }
      },
    })
    controller.respondWith(new Response(stream, {}))
  })

  const request = http.get('http://localhost/resource')
  request.on('error', requestErrorListener)
  request.on('response', (response) => {
    response.on('error', responseErrorListener)
  })

  await vi.waitFor(() => {
    return new Promise<http.IncomingMessage>((resolve) => {
      request.on('error', resolve)
    })
  })

  // Response body stream errors cannot be translated to unhandled exceptions
  // since the headers may already have been sent. Instead we need to
  // ensure that the error event is issued

  expect(responseErrorListener).toHaveBeenCalledOnce()
  expect(responseErrorListener).toHaveBeenCalledWith(new Error('stream error'))

  expect(requestErrorListener).toHaveBeenCalledOnce()
  expect(requestErrorListener).toHaveBeenCalledWith(new Error('stream error'))
  expect(request.destroyed).toBe(true)
})

it('forwards unhandled ReadableStream errors to the request', async () => {
  const requestErrorListener = vi.fn()
  const responseErrorListener = vi.fn()
  const chunks = ['first', 'second', 'third']

  interceptor.once('request', ({ controller }) => {
    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()
        await sleep(200)
        if (chunk) {
          controller.enqueue(encoder.encode(chunk))
        } else {
          // Enqueue an invalid value
          controller.enqueue({})
        }
      },
    })
    controller.respondWith(new Response(stream, {}))
  })

  const request = http.get('http://localhost/resource')
  request.on('error', requestErrorListener)
  request.on('response', (response) => {
    response.on('error', responseErrorListener)
  })

  await vi.waitFor(() => {
    return new Promise<http.IncomingMessage>((resolve) => {
      request.on('error', resolve)
    })
  })

  // Response body stream errors cannot be translated to unhandled exceptions
  // since the headers may already have been sent. Instead we need to
  // ensure that the error event is issued

  expect(responseErrorListener).toHaveBeenCalledOnce()
  expect(responseErrorListener).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'ERR_INVALID_ARG_TYPE' })
  )

  expect(requestErrorListener).toHaveBeenCalledOnce()
  expect(requestErrorListener).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'ERR_INVALID_ARG_TYPE' })
  )
  expect(request.destroyed).toBe(true)
})
