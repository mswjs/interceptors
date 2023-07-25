import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { AbortControllerManager } from '../../utils/AbortControllerManager'
import { FetchInterceptor } from './index'

describe('FetchInterceptor', () => {
  const noop = () => {}
  const httpServer = new HttpServer((app) => {
    app.get('/', (_req, res) => {
      res.status(200).send('/')
    })
    app.get('/get', (_req, res) => {
      res.status(200).send('/get')
    })
  })

  const interceptor = new FetchInterceptor()

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

  it('add an AbortSignal to the request if missing', async () => {
    const requestUrl = httpServer.http.url('/')

    const requestEmitted = new DeferredPromise<void>()
    interceptor.on('request', function requestListener({ request }) {
      expect(request.signal).toBeInstanceOf(AbortSignal)
      requestEmitted.resolve()
    })

    fetch(requestUrl).catch(noop)
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

    const requestAborted = new DeferredPromise<void>()
    fetch(requestUrl, { signal: controller.signal }).catch((err) => {
      expect(err.name).toEqual('AbortError')
      requestAborted.resolve()
    })

    await requestEmitted
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
    const requestWithoutUserController = fetch(requestUrl)
    const requestWithUserController = fetch(requestUrl, { signal: controller.signal })

    const requests = [requestWithoutUserController, requestWithUserController]

    const requestsAborted = requests.map((request) => {
      const requestAborted = new DeferredPromise<void>()

      request.catch((err) => {
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

    const stream = {
      open: true
    }

    function createBodyStream() {
      return new ReadableStream({
        pull: function(controller) {
          if (!stream.open) {
            controller.close()
            return
          }
          console.log('pull called!')
          controller.enqueue('Some data...')
        }
      })
    }

    const abortController = new AbortController()
    const requestWithoutUserController = fetch(requestUrl, {
      method: 'POST',
      // @ts-ignore
      duplex: 'half',
      body: createBodyStream(),
    })
    const requestWithUserController = fetch(requestUrl, {
      method: 'POST',
      // @ts-ignore
      duplex: 'half',
      body: createBodyStream(),
      signal: abortController.signal
    })

    const requests = [requestWithoutUserController, requestWithUserController]

    const requestsAborted = requests.map((request) => {
      const requestAborted = new DeferredPromise<void>()

      request.catch((err) => {
        expect(err.name).toEqual('AbortError')
        requestAborted.resolve()
      })

      return requestAborted
    })

    interceptor.dispose()
    stream.open = false
    // requests.forEach(request => request.end())

    await Promise.all(requestsAborted)
  })

  it('signal is forgotten when the request ends', async () => {
    const requestUrl = httpServer.http.url('/')

    interceptor.on('request', function requestListener({ request }) {
      request.respondWith(new Response())
    })

    const abortController = new AbortController()
    const response = fetch(requestUrl, { signal: abortController.signal })

    await response

    const manager = new AbortControllerManager()
    expect(manager.isRegistered(abortController)).toBeFalsy()
    expect(manager.isReferenced(abortController)).toBeFalsy()
  })
})