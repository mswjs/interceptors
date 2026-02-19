/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import https from 'https'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('response with keep-alive')
  })

  app.get('/stream', (_req, res) => {
    res.write('chunk1')
    setTimeout(() => {
      res.write('chunk2')
      res.end()
    }, 10)
  })
})

const interceptor = new ClientRequestInterceptor()

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

it('responds to an HTTP request with connection: keep-alive header', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock response', {
        status: 200,
        headers: {
          Connection: 'keep-alive',
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  const request = http.get('http://localhost/', {
    headers: {
      Connection: 'keep-alive',
    },
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers.connection).toBe('keep-alive')
  expect(await text()).toBe('mock response')
})

it('responds to an HTTP request with connection: close header', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock response', {
        status: 200,
        headers: {
          Connection: 'close',
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  const request = http.get('http://localhost/', {
    headers: {
      Connection: 'close',
    },
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers.connection).toBe('close')
  expect(await text()).toBe('mock response')
})

it('responds to an HTTP request without connection header', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock response', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  const request = http.get('http://localhost/')

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('mock response')
})

it('responds to an HTTPS request with connection: keep-alive header', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock response https', {
        status: 200,
        headers: {
          Connection: 'keep-alive',
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  const request = https.get('https://localhost/', {
    headers: {
      Connection: 'keep-alive',
    },
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers.connection).toBe('keep-alive')
  expect(await text()).toBe('mock response https')
})

it('responds to a streaming request with connection: keep-alive header', async () => {
  interceptor.on('request', ({ controller }) => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(streamController) {
        streamController.enqueue(encoder.encode('chunk1'))
        setTimeout(() => {
          streamController.enqueue(encoder.encode('chunk2'))
          streamController.close()
        }, 10)
      },
    })

    controller.respondWith(
      new Response(stream, {
        status: 200,
        headers: {
          Connection: 'keep-alive',
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  const request = http.get('http://localhost/', {
    headers: {
      Connection: 'keep-alive',
    },
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers.connection).toBe('keep-alive')
  expect(await text()).toBe('chunk1chunk2')
})

it('handles multiple sequential requests with keep-alive', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock response sequential', {
        status: 200,
        headers: {
          Connection: 'keep-alive',
          'Content-Type': 'text/plain',
        },
      })
    )
  })

  // First request
  const request1 = http.get('http://localhost/', {
    headers: {
      Connection: 'keep-alive',
    },
  })

  const { res: res1, text: text1 } = await waitForClientRequest(request1)

  expect(res1.statusCode).toBe(200)
  expect(res1.headers.connection).toBe('keep-alive')
  expect(await text1()).toBe('mock response sequential')

  // Second request
  const request2 = http.get('http://localhost/', {
    headers: {
      Connection: 'keep-alive',
    },
  })

  const { res: res2, text: text2 } = await waitForClientRequest(request2)

  expect(res2.statusCode).toBe(200)
  expect(res2.headers.connection).toBe('keep-alive')
  expect(await text2()).toBe('mock response sequential')
})
