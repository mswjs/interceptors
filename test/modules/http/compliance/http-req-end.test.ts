// @vitest-environment node
import { it, expect, afterAll, afterEach, beforeAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../..//helpers'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.post('/resource', (req, res) => {
    res.send('original response')
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

it('allows calling "req.end()" in the "connect" socket event (bypass)', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: { 'X-My-Header': '1' },
  })
  request.on('socket', (socket) => {
    socket.on('connect', () => {
      request.end()
    })
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')
})

it('allows calling "req.end()" in the "connect" socket event (interceptor + bypass)', async () => {
  const requestPromise = new DeferredPromise<Request>()
  interceptor.on('request', ({ request }) => {
    requestPromise.resolve(request)
  })

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: { 'X-My-Header': '1' },
  })
  request.on('socket', (socket) => {
    socket.on('connect', () => {
      request.end()
    })
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')

  const interceptedRequest = await requestPromise
  expect(interceptedRequest.method).toBe('POST')
  expect(interceptedRequest.url).toBe(httpServer.http.url('/resource'))
  expect(Array.from(interceptedRequest.headers)).toEqual([['x-my-header', '1']])
})

it('allows calling "req.end()" in the "connect" socket event (mocked)', async () => {
  const requestPromise = new DeferredPromise<Request>()
  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response('mocked response'))
  })

  const request = http.request('http://localhost/irrelevant', {
    method: 'POST',
    headers: { 'X-My-Header': '1' },
  })
  request.on('socket', (socket) => {
    socket.on('connect', () => {
      request.end()
    })
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('mocked response')

  const interceptedRequest = await requestPromise
  expect(interceptedRequest.method).toBe('POST')
  expect(interceptedRequest.url).toBe('http://localhost/irrelevant')
  expect(Array.from(interceptedRequest.headers)).toEqual([['x-my-header', '1']])
})
