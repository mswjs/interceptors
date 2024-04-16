/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { Readable } from 'node:stream'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

function createErrorStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('original'))
      queueMicrotask(() => {
        controller.error(new Error('stream error'))
      })
    },
  })
}

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.pipe(Readable.fromWeb(createErrorStream()))
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
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
  const requestErrorListener = vi.fn()
  const responseErrorListener = vi.fn()

  interceptor.once('request', ({ request }) => {
    request.respondWith(new Response(createErrorStream()))
  })

  const request = http.get(httpServer.http.url('/resource'))
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
