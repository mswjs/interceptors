/**
 * @vitest-environment node
 */
import { vi, beforeAll, afterEach, afterAll, it, expect } from 'vitest'
import http from 'node:http'
import express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.use(express.json())
  app.post('/user', (req, res) => {
    res.set({ 'x-custom-header': 'yes' }).send(`hello, ${req.body.name}`)
  })
})

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

it('bypasses a request to the existing host', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request }) => requestListener(request))

  const request = http.request(httpServer.http.url('/user'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  })
  request.write(JSON.stringify({ name: 'john' }))
  request.end()
  const { text, res } = await waitForClientRequest(request)

  // Must expose the request reference to the listener.
  const [requestFromListener] = requestListener.mock.calls[0]

  expect(requestFromListener.url).toBe(httpServer.http.url('/user'))
  expect(requestFromListener.method).toBe('POST')
  expect(requestFromListener.headers.get('content-type')).toBe(
    'application/json'
  )
  expect(await requestFromListener.json()).toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'yes')
  expect(await text()).toBe('hello, john')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

it('errors on a request to a non-existing host', async () => {
  const responseListener = vi.fn()
  const errorPromise = new DeferredPromise<Error>()
  const request = http.request('http://abc123-non-existing.lol', {
    method: 'POST',
  })
  request.on('response', responseListener)
  request.on('error', (error) => errorPromise.resolve(error))
  request.end()

  await expect(() => waitForClientRequest(request)).rejects.toThrow(
    'getaddrinfo ENOTFOUND abc123-non-existing.lol'
  )

  // Must emit the "error" event on the request.
  expect(await errorPromise).toEqual(
    new Error('getaddrinfo ENOTFOUND abc123-non-existing.lol')
  )
  // Must not call the "response" event.
  expect(responseListener).not.toHaveBeenCalled()
})

it('mocked request to an existing host', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request }) => {
    requestListener(request.clone())

    const data = await request.json()
    request.respondWith(
      new Response(`howdy, ${data.name}`, {
        headers: {
          'x-custom-header': 'mocked',
        },
      })
    )
  })

  const request = http.request(httpServer.http.url('/user'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  })
  request.write(JSON.stringify({ name: 'john' }))
  request.end()
  const { text, res } = await waitForClientRequest(request)

  // Must expose the request reference to the listener.
  const [requestFromListener] = requestListener.mock.calls[0]
  expect(requestFromListener.url).toBe(httpServer.http.url('/user'))
  expect(requestFromListener.method).toBe('POST')
  expect(requestFromListener.headers.get('content-type')).toBe(
    'application/json'
  )
  expect(await requestFromListener.json()).toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'mocked')
  expect(await text()).toBe('howdy, john')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

it('mocks response to a non-existing host', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request }) => {
    requestListener(request.clone())

    const data = await request.json()
    request.respondWith(
      new Response(`howdy, ${data.name}`, {
        headers: {
          'x-custom-header': 'mocked',
        },
      })
    )
  })

  const request = http.request('http://foo.example.com', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  })
  request.write(JSON.stringify({ name: 'john' }))
  request.end()
  const { text, res } = await waitForClientRequest(request)

  // Must expose the request reference to the listener.
  const [requestFromListener] = requestListener.mock.calls[0]
  expect(requestFromListener.url).toBe('http://foo.example.com/')
  expect(requestFromListener.method).toBe('POST')
  expect(requestFromListener.headers.get('content-type')).toBe(
    'application/json'
  )
  expect(await requestFromListener.json()).toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'mocked')
  expect(await text()).toBe('howdy, john')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

it('returns mocked socket address', async () => {
  interceptor.on('request', async ({ request }) => {
    request.respondWith(new Response())
  })

  const connectPromise = new DeferredPromise<object>()
  const request = http.get('http://example.com')
  request.once('socket', socket => {
    socket.once('connect', () => {
      connectPromise.resolve(socket.address())
    })
  })

  await expect(connectPromise).resolves.toEqual({
    address: '0.0.0.0',
    family: 'IPv4',
    port: 0,
  })
});


it.only('returns real socket address', async () => {
  const connectPromise = new DeferredPromise<object>()
  const request = http.get(httpServer.http.url('/user'))
  request.once('socket', socket => {
    socket.once('connect', () => {
      connectPromise.resolve(socket.address())
    })
  })

  await expect(connectPromise).resolves.toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: expect.any(Number),
  })
});