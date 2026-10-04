// @vitest-environment node
import { setTimeout as sleep } from 'node:timers/promises'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { connectHttp2Session, toHttp2WebResponse } from '#/test/helpers'

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

const encoder = new TextEncoder()

it('responds with a mocked response stream', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new ReadableStream({
          start(streamController) {
            streamController.enqueue(encoder.encode('one,'))
            streamController.enqueue(encoder.encode('two,'))
            streamController.enqueue(encoder.encode('three'))
            streamController.close()
          },
        })
      )
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('one,two,three')
})

it('delivers the chunks of a mocked response stream as they are sent', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new ReadableStream({
          async start(streamController) {
            streamController.enqueue(encoder.encode('first'))
            await sleep(200)
            streamController.enqueue(encoder.encode('second'))
            streamController.close()
          },
        })
      )
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const chunkTimestamps: Array<number> = []
  const chunks: Array<string> = []

  stream.setEncoding('utf8').on('data', (chunk) => {
    chunks.push(chunk)
    chunkTimestamps.push(performance.now())
  })

  await expect.poll(() => chunks).toEqual(['first', 'second'])
  expect(chunkTimestamps[1] - chunkTimestamps[0]).toBeGreaterThanOrEqual(150)
})

it('resets the request if a mocked response stream errors', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new ReadableStream({
          async start(streamController) {
            streamController.enqueue(encoder.encode('first'))
            await sleep(100)
            streamController.error(new Error('Response stream error'))
          },
        })
      )
    )
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(200)
  await expect(response.text()).rejects.toThrow()
})
