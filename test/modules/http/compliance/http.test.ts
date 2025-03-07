// @vitest-environment node
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
  await expect(requestFromListener.json()).resolves.toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'yes')
  await expect(text()).resolves.toBe('hello, john')
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
  await expect(errorPromise).resolves.toEqual(
    expect.objectContaining({
      message: 'getaddrinfo ENOTFOUND abc123-non-existing.lol',
      code: 'ENOTFOUND',
      hostname: 'abc123-non-existing.lol',
    })
  )
  // Must not call the "response" event.
  expect(responseListener).not.toHaveBeenCalled()
})

it('mocked request to an existing host', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request, controller }) => {
    requestListener(request.clone())

    const data = await request.json()
    controller.respondWith(
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
  await expect(requestFromListener.json()).resolves.toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'mocked')
  await expect(text()).resolves.toBe('howdy, john')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

it('mocks response to a non-existing host', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request, controller }) => {
    requestListener(request.clone())

    const data = await request.json()
    controller.respondWith(
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
  await expect(requestFromListener.json()).resolves.toEqual({ name: 'john' })

  // Must receive the correct response.
  expect(res.headers).toHaveProperty('x-custom-header', 'mocked')
  await expect(text()).resolves.toBe('howdy, john')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

it('returns socket address for a mocked request', async () => {
  interceptor.on('request', async ({ controller }) => {
    controller.respondWith(new Response())
  })

  const addressPromise = new DeferredPromise<object>()
  const request = http.get('http://example.com')
  request.once('socket', (socket) => {
    socket.once('connect', () => {
      addressPromise.resolve(socket.address())
    })
  })

  await expect(addressPromise).resolves.toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: 80,
  })
})

it('returns socket address for a mocked request with family: 6', async () => {
  interceptor.on('request', async ({ controller }) => {
    controller.respondWith(new Response())
  })

  const addressPromise = new DeferredPromise<object>()
  const request = http.get('http://example.com', { family: 6 })
  request.once('socket', (socket) => {
    socket.once('connect', () => {
      addressPromise.resolve(socket.address())
    })
  })

  await expect(addressPromise).resolves.toEqual({
    address: '::1',
    family: 'IPv6',
    port: 80,
  })
})

it('returns socket address for a mocked request with IPv6 hostname', async () => {
  interceptor.on('request', async ({ controller }) => {
    controller.respondWith(new Response())
  })

  const addressPromise = new DeferredPromise<object>()
  const request = http.get('http://[::1]')
  request.once('socket', (socket) => {
    socket.once('connect', () => {
      addressPromise.resolve(socket.address())
    })
  })

  await expect(addressPromise).resolves.toEqual({
    address: '::1',
    family: 'IPv6',
    port: 80,
  })
})

it('returns socket address for a bypassed request', async () => {
  const addressPromise = new DeferredPromise<object>()
  const request = http.get(httpServer.http.url('/user'))
  request.once('socket', (socket) => {
    socket.once('connect', () => {
      addressPromise.resolve(socket.address())
    })
  })

  await waitForClientRequest(request)

  await expect(addressPromise).resolves.toEqual({
    address: httpServer.http.address.host,
    family: 'IPv4',
    /**
     * @fixme Looks like every "http" request has an agent set.
     * That agent, for some reason, wants to connect to a different port.
     */
    port: expect.any(Number),
  })
})
