import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import * as express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text(), (req, res) =>
    res.send(`received: ${req.body}`)
  )
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor['emitter'].removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not mark request body as used for request with no listeners', async () => {
  const request = new Request(httpServer.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })
  const responsePromise = fetch(request)
  const bodyUsedAfterFetch = request.bodyUsed

  await interceptor['emitter'].untilIdle('request')
  const bodyUsedAfterListeners = request.bodyUsed

  const response = await responsePromise
  const bodyUsedAfterResponse = request.bodyUsed

  expect(bodyUsedAfterFetch).toBe(false)
  expect(bodyUsedAfterListeners).toBe(false)
  expect(bodyUsedAfterResponse).toBe(false)

  expect(await response.text()).toBe('received: Hello server')
})

it('does not mark request body as used for request with a bypass listener', async () => {
  interceptor.on('request', ({ request }) => {
    return
  })

  const request = new Request(httpServer.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })
  const responsePromise = fetch(request)
  const bodyUsedAfterFetch = request.bodyUsed

  await interceptor['emitter'].untilIdle('request')
  const bodyUsedAfterListeners = request.bodyUsed

  const response = await responsePromise
  const bodyUsedAfterResponse = request.bodyUsed

  expect(bodyUsedAfterFetch).toBe(false)
  expect(bodyUsedAfterListeners).toBe(false)
  expect(bodyUsedAfterResponse).toBe(false)

  expect(await response.text()).toBe('received: Hello server')
})

it('does not mark request body as used for request with a mocked response listener', async () => {
  interceptor.on('request', ({ request }) => {
    // The request body remains unused because the listener
    // never read it. Nothing else should.
    request.respondWith(new Response('Mocked response'))
  })

  const request = new Request(httpServer.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })
  const responsePromise = fetch(request)
  const bodyUsedAfterFetch = request.bodyUsed

  await interceptor['emitter'].untilIdle('request')
  const bodyUsedAfterListeners = request.bodyUsed

  const response = await responsePromise
  const bodyUsedAfterResponse = request.bodyUsed

  expect(bodyUsedAfterFetch).toBe(false)
  expect(bodyUsedAfterListeners).toBe(false)
  expect(bodyUsedAfterResponse).toBe(false)

  expect(await response.text()).toBe('Mocked response')
})

it('marks request body as used if the mocked response listener reads it', async () => {
  interceptor.on('request', async ({ request }) => {
    const text = await request.text()

    // The request body remains unused because the listener
    // never read it. Nothing else should.
    request.respondWith(new Response(`mocked: ${text}`))
  })

  const request = new Request(httpServer.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })
  const responsePromise = fetch(request)
  const bodyUsedAfterFetch = request.bodyUsed

  await interceptor['emitter'].untilIdle('request')
  const bodyUsedAfterListeners = request.bodyUsed

  const response = await responsePromise
  const bodyUsedAfterResponse = request.bodyUsed

  expect(bodyUsedAfterFetch).toBe(false)
  // Since the request listener reads the request body,
  // it should only be marked as read after the listeners are done.
  expect(bodyUsedAfterListeners).toBe(true)
  expect(bodyUsedAfterResponse).toBe(true)

  expect(await response.text()).toBe('mocked: Hello server')
})
