// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { performance } from 'node:perf_hooks'
import http from 'node:http'
import { Readable } from 'node:stream'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { sleep, waitForClientRequest } from '../../../helpers'

type ResponseChunks = Array<{ buffer: Buffer; timestamp: number }>

const encoder = new TextEncoder()

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.writeHead(200)
    Readable.fromWeb(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error('stream error'))
        },
      }) as any
    ).pipe(res)
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
      start(controller) {
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

it('destroys the socket on stream error if response headers have been sent', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('original'))
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

  const responseError = await vi.waitFor(() => {
    return new Promise<Error>((resolve) => {
      request.on('response', (response) => {
        console.log('response!')
        response.on('error', resolve)
      })
    })
  })

  expect.soft(request.destroyed).toBe(true)
  expect.soft(responseError).toBeInstanceOf(Error)
  expect.soft(responseError.message).toBe('stream error')

  expect
    .soft(requestErrorListener, 'Request must not error')
    .not.toHaveBeenCalled()
  expect.soft(requestCloseListener, 'Request must close').toHaveBeenCalledOnce()
})
