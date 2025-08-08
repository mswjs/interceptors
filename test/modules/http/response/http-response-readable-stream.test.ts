// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import { performance } from 'node:perf_hooks'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { sleep, waitForClientRequest } from '../../../helpers'

type ResponseChunks = Array<{ buffer: Buffer; timestamp: number }>

const encoder = new TextEncoder()

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.writeHead(200)
    res.destroy(new Error('stream error'))
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports ReadableStream as a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(encoder.encode('hello'))
        controller.enqueue(encoder.encode(' '))
        controller.enqueue(encoder.encode('world'))
        controller.close()
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://localhost/resource')
  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('hello world')
})

it('supports delays when enqueuing chunks', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      async pull(controller) {
        controller.enqueue(encoder.encode('first'))
        await sleep(200)

        controller.enqueue(encoder.encode('second'))
        await sleep(200)

        controller.enqueue(encoder.encode('third'))
        await sleep(200)

        controller.close()
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

  const request = http.get('http://api.localhost/stream', (response) => {
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

it('emits request error if the response stream errors (bypass)', async () => {
  const request = http.get(httpServer.http.url('/'))

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  const requestCloseListener = vi.fn()
  request.on('close', requestCloseListener)

  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('error', responseErrorListener)
  })

  await expect.poll(() => request.destroyed).toBe(true)

  expect.soft(requestErrorListener).toHaveBeenCalledOnce()
  expect.soft(requestErrorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'socket hang up',
    })
  )
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()
  expect.soft(responseErrorListener).not.toHaveBeenCalled()
})

it('emits request error if the response stream errors (mock)', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      async pull(controller) {
        controller.enqueue(new TextEncoder().encode('hello world'))
        controller.error(new Error('stream error'))
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get(httpServer.http.url('/'))

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  const requestCloseListener = vi.fn()
  request.on('close', requestCloseListener)

  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('error', responseErrorListener)
  })

  await expect.poll(() => request.destroyed).toBe(true)

  expect.soft(requestErrorListener).toHaveBeenCalledOnce()
  expect.soft(requestErrorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'socket hang up',
    })
  )
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()
  expect.soft(responseErrorListener).not.toHaveBeenCalled()
})
