// @vitest-environment node
import { DeferredPromise } from '@open-draft/deferred-promise'
import { createTestHttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { sleep } from '../../../helpers'

const interceptor = new FetchInterceptor()
const server = createTestHttpServer()

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it('aborts unsent request when the original request is aborted', async () => {
  await using room = server.http.createRoom({
    defineRoutes(router) {
      router.get('/', () => new Response())
    }
  })
  const controller = new AbortController()

  const abortErrorPromise = fetch(room.url('/'), {
    signal: controller.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  controller.abort()
  const abortError = await abortErrorPromise

  expect(abortError.name).toBe('AbortError')
  expect(abortError.message).toBe('This operation was aborted')
})

it('aborts a pending request when the original request is aborted', async () => {
  const requestListenerCalled = new DeferredPromise<void>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    await sleep(1000)
    controller.respondWith(new Response())
  })

  const controller = new AbortController()
  const abortErrorPromise = fetch(server.http.url('/delayed'), {
    signal: controller.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  controller.abort()
  const abortError = await abortErrorPromise

  expect(abortError.name).toBe('AbortError')
  expect(abortError.message).toBe('This operation was aborted')
})

it('forwards custom abort reason to the request if aborted before it starts', async () => {
  interceptor.once('request', () => {
    expect.fail('must not sent the request')
  })

  const controller = new AbortController()
  const request = fetch(server.http.url('/'), {
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

  interceptor.once('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    await sleep(1000)
    controller.respondWith(new Response())
  })

  const controller = new AbortController()
  const request = fetch(server.http.url('/delayed'), {
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
