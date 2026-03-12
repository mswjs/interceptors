// @vitest-environment node
import http from 'node:http'
import { Readable } from 'node:stream'
import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

type ResponseChunks = Array<{ buffer: Buffer; timestamp: number }>

const httpServer = new HttpServer((app) => {
  app.get('/stream/immediate-error', (req, res) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        controller.error(new Error('Response stream error'))
      },
    })

    res.writeHead(200)
    Readable.fromWeb(stream as any)
      .on('error', (error) => res.destroy(error))
      .pipe(res)
  })

  app.get('/stream/delayed-error', (req, res) => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        await setTimeout(100)
        controller.error(new Error('Response stream error'))
      },
    })

    res.writeHead(200)
    Readable.fromWeb(stream as any)
      .on('error', (error) => res.destroy(error))
      .pipe(res)
  })

  app.get('/stream/exception', (req, res) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        // Intentionally invalid input.
        controller.enqueue({})
      },
    })

    res.writeHead(200)
    Readable.fromWeb(stream as any)
      .on('error', (error) => res.destroy(error))
      .pipe(res)
  })
})

const encoder = new TextEncoder()
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
  const encoder = new TextEncoder()
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
  const [response] = await toWebResponse(request)
  await expect(response.text()).resolves.toBe('hello world')
})

it('supports delays between the mock response stream chunks', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first'))
        await setTimeout(150)

        controller.enqueue(encoder.encode('second'))
        await setTimeout(150)

        controller.enqueue(encoder.encode('third'))
        await setTimeout(150)

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

  const request = http.get('http://localhost/stream')
  const responseChunks: ResponseChunks = []

  const responseErrorListener = vi.fn()
  const requestCloseListener = vi.fn()

  request
    .on('response', (response) => {
      response.on('data', (data) => {
        responseChunks.push({
          buffer: data,
          timestamp: performance.now(),
        })
      })
    })
    .on('error', responseErrorListener)
    .on('close', requestCloseListener)

  await expect.poll(() => requestCloseListener).toHaveBeenCalled()

  expect
    .soft(responseChunks.map((chunk) => chunk.buffer))
    .toEqual([
      Buffer.from('first'),
      Buffer.from('second'),
      Buffer.from('third'),
    ])

  // Ensure that the chunks were sent over time,
  // respecting the delay set in the mocked stream.
  const chunkTimings = responseChunks.map((chunk) => chunk.timestamp)
  expect(chunkTimings[1] - chunkTimings[0]).toBeGreaterThanOrEqual(140)
  expect(chunkTimings[2] - chunkTimings[1]).toBeGreaterThanOrEqual(140)
})

it('handles immediate mock response stream errors as response errors', async () => {
  const streamError = new Error('stream error')

  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        controller.error(streamError)
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://localhost/stream')

  const socketErrorListener = vi.fn()
  const socketCloseListener = vi.fn()
  const requestResponseListener = vi.fn()
  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()

  request
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener).on('close', socketCloseListener)
    })
    .on('response', requestResponseListener)
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('data', responseDataListener).on('error', responseErrorListener)
  })

  /**
   * @note Response stream errors are handled differently in Node.js
   * depending on whether the response headers were flushed by the server.
   * Normally, Node.js buffers the message headers until (1) response ends;
   * (2) the first response chunk is sent. We maintain that default behavior
   * for performance considerations. Whether headers are flushed has no effect
   * on the client, that's an implementation detail.
   */
  await expect
    .poll(() => requestErrorListener)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: 'ECONNRESET',
        message: 'socket hang up',
      })
    )
  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestResponseListener).not.toHaveBeenCalled()
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()

  expect.soft(responseDataListener).not.toHaveBeenCalled()
  expect.soft(responseErrorListener).not.toHaveBeenCalled()

  expect.soft(socketErrorListener).not.toHaveBeenCalled()
  expect.soft(socketCloseListener).toHaveBeenCalledExactlyOnceWith(false)
})

it('handles immediate bypassed response stream errors as request errors', async () => {
  const request = http.get(httpServer.http.url('/stream/immediate-error'))

  const socketErrorListener = vi.fn()
  const socketCloseListener = vi.fn()
  const requestResponseListener = vi.fn()
  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()

  request
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener).on('close', socketCloseListener)
    })
    .on('response', requestResponseListener)
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('data', responseDataListener).on('error', responseErrorListener)
  })

  await expect
    .poll(() => requestErrorListener)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: 'ECONNRESET',
        message: 'socket hang up',
      })
    )
  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestResponseListener).not.toHaveBeenCalled()
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()

  expect.soft(responseDataListener).not.toHaveBeenCalled()
  expect.soft(responseErrorListener).not.toHaveBeenCalled()

  expect.soft(socketErrorListener).not.toHaveBeenCalled()
  expect.soft(socketCloseListener).toHaveBeenCalledExactlyOnceWith(false)
})

it('handles delayed mock response stream errors as response errors', async () => {
  const streamError = new Error('stream error')

  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        /**
         * @note Pause is important here so that Node.js flushes the response headers
         * before the stream errors. If the error happens immediately, Node.js will
         * optimize for that and translate it into the request error.
         */
        await setTimeout(100)
        controller.error(streamError)
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://localhost/stream')

  const socketErrorListener = vi.fn()
  const socketCloseListener = vi.fn()
  const requestResponseListener = vi.fn()
  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()

  request
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener).on('close', socketCloseListener)
    })
    .on('response', requestResponseListener)
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('data', responseDataListener).on('error', responseErrorListener)
  })

  await expect
    .poll(() => responseErrorListener)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'ECONNRESET' })
    )
  expect
    .soft(responseDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('first-chunk'))

  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestResponseListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    })
  )
  expect.soft(requestErrorListener).not.toHaveBeenCalled()
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()

  expect.soft(socketErrorListener).not.toHaveBeenCalled()
  expect.soft(socketCloseListener).toHaveBeenCalledExactlyOnceWith(false)
})

it('handles delayed bypassed response stream errors as response errors', async () => {
  const request = http.get(httpServer.http.url('/stream/delayed-error'))

  const socketErrorListener = vi.fn()
  const socketCloseListener = vi.fn()
  const requestResponseListener = vi.fn()
  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()

  request
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener).on('close', socketCloseListener)
    })
    .on('response', requestResponseListener)
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()
  request.on('response', (response) => {
    response.on('data', responseDataListener).on('error', responseErrorListener)
  })

  await expect
    .poll(() => responseErrorListener)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'ECONNRESET' })
    )
  expect
    .soft(responseDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('first-chunk'))

  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestResponseListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    })
  )
  expect.soft(requestErrorListener).not.toHaveBeenCalled()
  expect.soft(requestCloseListener).toHaveBeenCalledOnce()

  expect.soft(socketErrorListener).not.toHaveBeenCalled()
  expect.soft(socketCloseListener).toHaveBeenCalledExactlyOnceWith(false)
})

it('treats unhandled exceptions during bypass response stream as response errors', async () => {
  const request = http.get(httpServer.http.url('/stream/exception'))

  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()
  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()

  request
    .on('response', (response) => {
      response
        .on('data', responseDataListener)
        .on('error', responseErrorListener)
    })
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  await expect.poll(() => requestCloseListener).toHaveBeenCalledOnce()
  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestErrorListener).not.toHaveBeenCalled()

  expect
    .soft(responseDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('first-chunk'))
  expect.soft(responseErrorListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      code: 'ECONNRESET',
      message: 'aborted',
    })
  )
})

it.only('treats unhandled exceptions during mock response stream as response errors', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        // Intentionally invalid input.
        controller.enqueue({})
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://localhost/resource')

  const requestErrorListener = vi.fn()
  const requestCloseListener = vi.fn()
  const responseDataListener = vi.fn()
  const responseErrorListener = vi.fn()

  request
    .on('response', (response) => {
      response
        .on('data', responseDataListener)
        .on('error', responseErrorListener)
    })
    .on('error', requestErrorListener)
    .on('close', requestCloseListener)

  await expect.poll(() => requestCloseListener).toHaveBeenCalledOnce()
  expect.soft(request.destroyed).toBe(true)
  expect.soft(requestErrorListener).not.toHaveBeenCalled()

  expect
    .soft(responseDataListener)
    .toHaveBeenCalledExactlyOnceWith(Buffer.from('first-chunk'))
  expect.soft(responseErrorListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      code: 'ECONNRESET',
      message: 'aborted',
    })
  )
})
