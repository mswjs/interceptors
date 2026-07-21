import { DeferredPromise } from '@open-draft/deferred-promise'
import { InterceptorError } from '@mswjs/interceptors'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('aborts unsent request when the original request is aborted', async ({
  task,
}) => {
  const controller = new AbortController()

  const abortErrorPromise = fetch(server.http.url('/resource'), {
    signal: controller.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  controller.abort()
  const abortError = await abortErrorPromise

  expect.soft(abortError.name).toBe('AbortError')
  expect
    .soft(abortError.message)
    .toBe(
      task.file.projectName === 'browser'
        ? 'signal is aborted without reason'
        : 'This operation was aborted'
    )
})

it('aborts a pending request when the original request is aborted', async ({
  task,
}) => {
  const requestListenerCalled = new DeferredPromise<void>()
  const fetchRejected = new DeferredPromise<void>()
  const lateRespondWithResult = new DeferredPromise<Error | undefined>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()

    // Suspend the listener until the fetch promise has rejected
    // so responding here is guaranteed to happen after the abort.
    await fetchRejected

    try {
      controller.respondWith(new Response())
      lateRespondWithResult.resolve(undefined)
    } catch (error) {
      if (error instanceof Error) {
        lateRespondWithResult.resolve(error)
      } else {
        lateRespondWithResult.reject(error)
      }
    }
  })

  const controller = new AbortController()
  const abortErrorPromise = fetch(server.http.url('/delay'), {
    signal: controller.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  await requestListenerCalled
  controller.abort()
  const abortError = await abortErrorPromise

  expect.soft(abortError.name).toBe('AbortError')
  expect
    .soft(abortError.message)
    .toBe(
      task.file.projectName === 'browser'
        ? 'signal is aborted without reason'
        : 'This operation was aborted'
    )

  // Responding to an aborted request must throw a controlled error,
  // not crash outside of the request listener.
  fetchRejected.resolve()
  const lateRespondWithError = await lateRespondWithResult

  expect(lateRespondWithError).toBeInstanceOf(InterceptorError)
  expect(lateRespondWithError?.message).toBe(
    `Failed to respond to the "GET ${server.http.url(
      '/delay'
    )}" request with "200 OK": the request has already been handled (3)`
  )
})

it('forwards custom abort reason to the request if aborted before it starts', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const controller = new AbortController()
  const request = fetch(server.http.url('/resource'), {
    signal: controller.signal,
  })

  const requestAborted = new DeferredPromise<NodeJS.ErrnoException>()
  request.catch(requestAborted.resolve)

  controller.abort(new Error('Custom abort reason'))

  const abortError = await requestAborted

  expect(abortError.name).toBe('Error')
  expect(abortError.code).toBeUndefined()
  expect(abortError.message).toBe('Custom abort reason')

  /**
   * @note An assertion inside the request listener would be
   * swallowed by the interceptor once the request is aborted.
   * Assert the listener was never called from the test instead.
   */
  expect(requestListener).not.toHaveBeenCalled()
})

it('forwards custom abort reason to the request if pending', async () => {
  const requestListenerCalled = new DeferredPromise<void>()
  const requestAborted = new DeferredPromise<Error>()
  const fetchRejected = new DeferredPromise<void>()
  const lateRespondWithResult = new DeferredPromise<Error | undefined>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()

    // Suspend the listener until the fetch promise has rejected
    // so responding here is guaranteed to happen after the abort.
    await fetchRejected

    try {
      controller.respondWith(new Response())
      lateRespondWithResult.resolve(undefined)
    } catch (error) {
      if (error instanceof Error) {
        lateRespondWithResult.resolve(error)
      } else {
        lateRespondWithResult.reject(error)
      }
    }
  })

  const controller = new AbortController()
  const request = fetch(server.http.url('/delay'), {
    signal: controller.signal,
  }).then(() => {
    expect.fail('must not return any response')
  })

  request.catch(requestAborted.resolve)
  await requestListenerCalled

  controller.abort(new Error('Custom abort reason'))

  const abortError = await requestAborted
  expect(abortError.name).toBe('Error')
  expect(abortError.message).toBe('Custom abort reason')

  // Responding to an aborted request must throw a controlled error,
  // not crash outside of the request listener.
  fetchRejected.resolve()
  const lateRespondWithError = await lateRespondWithResult

  expect(lateRespondWithError).toBeInstanceOf(InterceptorError)
  expect(lateRespondWithError?.message).toBe(
    `Failed to respond to the "GET ${server.http.url(
      '/delay'
    )}" request with "200 OK": the request has already been handled (3)`
  )
})

it('respects requests aborted before they are dispatched', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const controller = new AbortController()
  const request = new Request(server.http.url('/resource'), {
    signal: controller.signal,
  })
  controller.abort()

  const abortError = await fetch(request).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  expect.soft(abortError.name).toBe('AbortError')
  expect
    .soft(abortError.message)
    .toBe(
      task.file.projectName === 'browser'
        ? 'signal is aborted without reason'
        : 'This operation was aborted'
    )
})

it('aborts the pending request via "AbortSignal.timeout"', async ({
  task,
}) => {
  const fetchRejected = new DeferredPromise<void>()
  const requestListenerDone = new DeferredPromise<void>()

  interceptor.on('request', async () => {
    // Keep the request pending until the timeout fires so the abort
    // is guaranteed to happen while the listener is still running.
    await fetchRejected
    requestListenerDone.resolve()
  })

  const abortError = await fetch('http://localhost/irrelevant', {
    signal: AbortSignal.timeout(200),
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  expect.soft(abortError.name).toBe('TimeoutError')
  expect
    .soft(abortError.message)
    .toBe(
      task.file.projectName === 'browser'
        ? 'signal timed out'
        : 'The operation was aborted due to timeout'
    )

  // Let the listener finish within this test so it does not
  // leak into the tests that run after it.
  fetchRejected.resolve()
  await requestListenerDone
})
