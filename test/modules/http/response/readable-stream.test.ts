import { it, expect, beforeAll, afterAll } from 'vitest'
import https from 'node:https'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { _ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index-new'
import { sleep } from '../../../helpers'

type ResponseChunks = Array<{ buffer: Buffer; timestamp: number }>

const encoder = new TextEncoder()

const interceptor = new _ClientRequestInterceptor()
interceptor.on('request', ({ request }) => {
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

beforeAll(async () => {
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
})

it('supports delays when enqueuing chunks', async () => {
  const responseChunksPromise = new DeferredPromise<ResponseChunks>()

  const request = https.get('https://api.example.com/stream', (response) => {
    const chunks: ResponseChunks = []

    response
      .on('data', (data) => {
        chunks.push({
          buffer: Buffer.from(data),
          timestamp: Date.now(),
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
