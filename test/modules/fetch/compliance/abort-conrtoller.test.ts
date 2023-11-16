// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { sleep } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
  app.get('/delayed', (_req, res) => {
    setTimeout(() => {
      res.status(200).send('/delayed')
    }, 1000)
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('aborts unsent request when the original request is aborted', async () => {
  interceptor.once('request', () => {
    expect.fail('must not sent the request')
  })

  const controller = new AbortController()
  const request = fetch(httpServer.http.url('/'), {
    signal: controller.signal,
  })

  const requestAborted = new DeferredPromise<NodeJS.ErrnoException>()
  request.catch(requestAborted.resolve)

  controller.abort()

  const abortError = await requestAborted

  expect(abortError.name).toBe('AbortError')
  expect(abortError.code).toBe(20)
  expect(abortError.message).toBe('This operation was aborted')
})

it('aborts a pending request when the original request is aborted', async () => {
  const requestListenerCalled = new DeferredPromise<void>()
  const requestAborted = new DeferredPromise<Error>()

  interceptor.once('request', async ({ request }) => {
    requestListenerCalled.resolve()
    await sleep(1_000)
    request.respondWith(new Response())
  })

  const controller = new AbortController()
  const request = fetch(httpServer.http.url('/delayed'), {
    signal: controller.signal,
  }).then(() => {
    expect.fail('must not return any response')
  })

  request.catch(requestAborted.resolve)
  await requestListenerCalled

  controller.abort()

  const abortError = await requestAborted
  expect(abortError.name).toBe('AbortError')
  expect(abortError.message).toBe('This operation was aborted')
})

it('forwards custom abort reason to the request if aborted before it starts', async () => {
  interceptor.once('request', () => {
    expect.fail('must not sent the request')
  })

  const controller = new AbortController()
  const request = fetch(httpServer.http.url('/'), {
    signal: controller.signal,
  })

  const requestAborted = new DeferredPromise<NodeJS.ErrnoException>()
  request.catch(requestAborted.resolve)

  controller.abort(new Error('Custom abort reason'))

  const abortError = await requestAborted

  expect(abortError.name).toBe('Error')
  expect(abortError.code).toBeUndefined()
  expect(abortError.message).toBe('Custom abort reason')
})

it('forwards custom abort reason to the request if pending', async () => {
  const requestListenerCalled = new DeferredPromise<void>()
  const requestAborted = new DeferredPromise<Error>()

  interceptor.once('request', async ({ request }) => {
    requestListenerCalled.resolve()
    await sleep(1_000)
    request.respondWith(new Response())
  })

  const controller = new AbortController()
  const request = fetch(httpServer.http.url('/delayed'), {
    signal: controller.signal,
  }).then(() => {
    expect.fail('must not return any response')
  })

  request.catch(requestAborted.resolve)
  await requestListenerCalled

  controller.abort(new Error('Custom abort reason'))

  const abortError = await requestAborted
  expect(abortError.name).toBe('Error')
  expect(abortError.message).toEqual('Custom abort reason')
})
