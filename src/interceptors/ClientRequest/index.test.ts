import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '.'
import { AbortControllerManager } from '../../utils/AbortControllerManager'

describe('ClientRequestInterceptor', () => {
  const httpServer = new HttpServer((app) => {
    app.get('/', (_req, res) => {
      res.status(200).send('/')
    })
    app.get('/get', (_req, res) => {
      res.status(200).send('/get')
    })
  })

  const interceptor = new ClientRequestInterceptor()

  beforeAll(async () => {
    await httpServer.listen()
  })

  afterAll(async () => {
    await httpServer.close()
  })

  beforeEach(() => {
    interceptor.apply()
  })

  afterEach(() => {
    interceptor.dispose()
  })

  it('forbids calling "respondWith" multiple times for the same request', async () => {
    const requestUrl = httpServer.http.url('/')

    interceptor.on('request', function firstRequestListener({ request }) {
      request.respondWith(new Response())
    })

    const secondRequestEmitted = new DeferredPromise<void>()
    interceptor.on('request', function secondRequestListener({ request }) {
      expect(() =>
        request.respondWith(new Response(null, { status: 301 }))
      ).toThrow(
        `Failed to respond to "GET ${requestUrl}" request: the "request" event has already been responded to.`
      )

      secondRequestEmitted.resolve()
    })

    const request = http.get(requestUrl)
    await secondRequestEmitted

    const responseReceived = new DeferredPromise<http.IncomingMessage>()
    request.on('response', (response) => {
      responseReceived.resolve(response)
    })

    const response = await responseReceived
    expect(response.statusCode).toBe(200)
    expect(response.statusMessage).toBe('')
  })

  it('add an AbortSignal to the request if missing', async () => {
    const requestUrl = httpServer.http.url('/')

    const requestEmitted = new DeferredPromise<void>()
    interceptor.on('request', function requestListener({ request }) {
      expect(request.signal).toBeInstanceOf(AbortSignal)
      requestEmitted.resolve()
    })

    http.get(requestUrl)
    await requestEmitted
  })

  it('keeps the existing AbortSignal if the request had one', async () => {
    const requestUrl = httpServer.http.url('/')
    const controller = new AbortController()

    /**
     * For some reason, controller.signal !== request.signal, some kind of un/wrapping must be happening.
     * Because of that, we test that aborting from the user controller aborts the request
     */

    const requestEmitted = new DeferredPromise<void>()
    interceptor.on('request', function requestListener({ request }) {
      expect(request.signal).toBeInstanceOf(AbortSignal)
      requestEmitted.resolve()
    })

    const request = http.get(requestUrl, { signal: controller.signal })
    await requestEmitted

    const requestAborted = new DeferredPromise<void>()
    request.on('error', (err) => {
      expect(err.name).toEqual('AbortError')
      requestAborted.resolve()
    })

    controller.abort()
    await requestAborted
  })

  it('abort ongoing requests when disposed', async () => {
    const requestUrl = httpServer.http.url('/')

    const requestEmitted = new DeferredPromise<void>()
    interceptor.on('request', function requestListener() {
      requestEmitted.resolve()
    })

    const controller = new AbortController()
    const requestWithoutUserController = http.get(requestUrl)
    const requestWithUserController = http.get(requestUrl, { signal: controller.signal })

    const requests = [requestWithoutUserController, requestWithUserController]

    const requestsAborted = requests.map(request => {
      const requestAborted = new DeferredPromise<void>()
      request.on('error', (err) => {
        expect(err.name).toEqual('AbortError')
        requestAborted.resolve()
      })

      return requestAborted
    })

    await requestEmitted
    interceptor.dispose()
    await Promise.all(requestsAborted)
  })

  it('abort upcoming requests when disposed', async () => {
    const requestUrl = httpServer.http.url('/')

    interceptor.on('request', function requestListener() {
      expect.fail('the request should never be sent, yet intercepted')
    })

    const controller = new AbortController()
    const requestWithoutUserController = http.request(requestUrl)
    const requestWithUserController = http.request(requestUrl, { signal: controller.signal })

    const requests = [requestWithoutUserController, requestWithUserController]

    const requestsAborted = requests.map(request => {
      const requestAborted = new DeferredPromise<void>()
      request.on('error', (err) => {
        expect(err.name).toEqual('AbortError')
        requestAborted.resolve()
      })

      return requestAborted
    })

    interceptor.dispose()
    requests.forEach(request => request.end())

    await Promise.all(requestsAborted)
  })

  it('signal is forgotten when the request ends', async () => {
    const requestUrl = httpServer.http.url('/')

    interceptor.on('request', function requestListener({ request }) {
      request.respondWith(new Response())
    })

    const controller = new AbortController()
    const request = http.get(requestUrl, { signal: controller.signal })

    const responseReceived = new DeferredPromise<http.IncomingMessage>()
    request.on('response', (response) => {
      responseReceived.resolve(response)
    })

    await responseReceived

    const manager = new AbortControllerManager()
    expect(manager.isRegistered(controller)).toBeFalsy()
    expect(manager.isReferenced(controller)).toBeFalsy()
  })
})