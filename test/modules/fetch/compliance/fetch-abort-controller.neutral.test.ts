import { DeferredPromise } from '@open-draft/deferred-promise'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { setTimeout } from '#/test/setup/helpers-neutral'
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
  interceptor.on('request', async ({ controller }) => {
    await setTimeout(1000)
    controller.respondWith(new Response())
  })

  const controller = new AbortController()
  const abortErrorPromise = fetch(server.http.url('/delay'), {
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

it('forwards custom abort reason to the request if aborted before it starts', async () => {
  interceptor.on('request', () => {
    expect.fail('must not sent the request')
  })

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
})

it('forwards custom abort reason to the request if pending', async () => {
  const requestListenerCalled = new DeferredPromise<void>()
  const requestAborted = new DeferredPromise<Error>()

  interceptor.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    await setTimeout(1000)
    controller.respondWith(new Response())
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
  interceptor.on('request', async () => {
    await setTimeout(300)
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
})
