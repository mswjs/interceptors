import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import { IncomingMessage } from 'http'
import { Emitter } from 'strict-event-emitter'
import { Logger } from '@open-draft/logger'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { NodeClientRequest } from './NodeClientRequest'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'
import { sleep } from '../../../test/helpers'
import { HttpRequestEventMap } from '../../glossary'

interface ErrorConnectionRefused extends NodeJS.ErrnoException {
  address: string
  port: number
}

const httpServer = new HttpServer((app) => {
  app.post('/comment', (_req, res) => {
    res.status(200).send('original-response')
  })

  app.post('/write', express.text(), (req, res) => {
    res.status(200).send(req.body)
  })
})

const logger = new Logger('test')

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

it('gracefully finishes the request when it has a mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://any.thing', {
      method: 'PUT',
    }),
    {
      emitter,
      logger,
    }
  )

  emitter.on('request', ({ request }) => {
    request.respondWith(
      new Response('mocked-response', {
        status: 301,
        headers: {
          'x-custom-header': 'yes',
        },
      })
    )
  })

  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()

  request.on('response', async (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  // Request must be marked as finished as soon as it's sent.
  expect(request.writableEnded).toBe(true)
  expect(request.writableFinished).toBe(true)
  expect(request.writableCorked).toBe(0)

  /**
   * Consume the response body, which will handle the "data" and "end"
   * events of the incoming message. After this point, the response is finished.
   */
  const text = await getIncomingMessageBody(response)

  // Response must be marked as finished as soon as its done.
  expect(request['response'].complete).toBe(true)

  expect(response.statusCode).toBe(301)
  expect(response.headers).toHaveProperty('x-custom-header', 'yes')
  expect(text).toBe('mocked-response')
})

it('responds with a mocked response when requesting an existing hostname', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.url('/comment')),
    {
      emitter,
      logger,
    }
  )

  emitter.on('request', ({ request }) => {
    request.respondWith(new Response('mocked-response', { status: 201 }))
  })

  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', async (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(response.statusCode).toBe(201)

  const text = await getIncomingMessageBody(response)
  expect(text).toBe('mocked-response')
})

it('performs the request as-is given resolver returned no mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.url('/comment'), {
      method: 'POST',
    }),
    {
      emitter,
      logger,
    }
  )

  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', async (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(request.finished).toBe(true)
  expect(request.writableEnded).toBe(true)

  expect(response.statusCode).toBe(200)
  expect(response.statusMessage).toBe('OK')
  expect(response.headers).toHaveProperty('x-powered-by', 'Express')

  const text = await getIncomingMessageBody(response)
  expect(text).toBe('original-response')
})

it('emits the ENOTFOUND error connecting to a non-existing hostname given no mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://non-existing-url.com'),
    { emitter, logger }
  )
  request.end()

  const errorReceived = new DeferredPromise<NodeJS.ErrnoException>()
  request.on('error', async (error) => {
    errorReceived.resolve(error)
  })
  const error = await errorReceived

  expect(error.code).toBe('ENOTFOUND')
  expect(error.syscall).toBe('getaddrinfo')
})

it('emits the ECONNREFUSED error connecting to an inactive server given no mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://127.0.0.1:12345'),
    {
      emitter,
      logger,
    }
  )

  request.end()

  const errorReceived = new DeferredPromise<ErrorConnectionRefused>()
  request.on('error', async (error: ErrorConnectionRefused) => {
    errorReceived.resolve(error)
  })
  request.end()

  const error = await errorReceived

  expect(error.code).toBe('ECONNREFUSED')
  expect(error.syscall).toBe('connect')
  expect(error.address).toBe('127.0.0.1')
  expect(error.port).toBe(12345)
})

it('does not emit ENOTFOUND error connecting to an inactive server given mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const handleError = vi.fn()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://non-existing-url.com'),
    { emitter, logger }
  )

  emitter.on('request', async ({ request }) => {
    await sleep(250)
    request.respondWith(
      new Response(null, { status: 200, statusText: 'Works' })
    )
  })

  request.end()

  request.on('error', handleError)

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(handleError).not.toHaveBeenCalled()
  expect(response.statusCode).toBe(200)
  expect(response.statusMessage).toBe('Works')
})

it('does not emit ECONNREFUSED error connecting to an inactive server given mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const handleError = vi.fn()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://localhost:9876'),
    {
      emitter,
      logger,
    }
  )

  emitter.on('request', async ({ request }) => {
    await sleep(250)
    request.respondWith(
      new Response(null, { status: 200, statusText: 'Works' })
    )
  })

  request.on('error', handleError)
  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(handleError).not.toHaveBeenCalled()
  expect(response.statusCode).toBe(200)
  expect(response.statusMessage).toBe('Works')
})

it('sends the request body to the server given no mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.url('/write'), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
    }),
    {
      emitter,
      logger,
    }
  )

  request.write('one')
  request.write('two')
  request.end('three')

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(response.statusCode).toBe(200)

  const text = await getIncomingMessageBody(response)
  expect(text).toBe('onetwothree')
})

it('does not send request body to the original server given mocked response', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.url('/write'), {
      method: 'POST',
    }),
    {
      emitter,
      logger,
    }
  )

  emitter.on('request', async ({ request }) => {
    await sleep(200)
    request.respondWith(new Response('mock created!', { status: 301 }))
  })

  request.write('one')
  request.write('two')
  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()
  request.on('response', (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(response.statusCode).toBe(301)

  const text = await getIncomingMessageBody(response)
  expect(text).toBe('mock created!')
})

it('does not lowercase the rawHeaders', async () => {
  const emitter = new Emitter<HttpRequestEventMap>()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://any.thing'),
    {
      emitter,
      logger,
    }
  )

  emitter.on('request', ({ request }) => {
    request.respondWith(
      new Response(null, {
        headers: {
          'X-Custom-Header': 'Yes',
        },
      })
    )
  })

  request.end()

  const responseReceived = new DeferredPromise<IncomingMessage>()

  request.on('response', async (response) => {
    responseReceived.resolve(response)
  })
  const response = await responseReceived

  expect(response.rawHeaders).toStrictEqual([ 'X-Custom-Header', 'Yes' ])
  expect(response.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})