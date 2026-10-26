import { Emitter } from 'rettime'
import { handleRequest } from './handle-request'
import {
  RequestController,
  type RequestControllerSource,
} from '../request-controller'
import type { HttpRequestEventMap } from '../events/http'

function createRequestHandling(signal: AbortSignal) {
  const request = new Request('http://localhost/resource', { signal })
  const source = {
    passthrough: vi.fn<RequestControllerSource['passthrough']>(),
    respondWith: vi.fn<RequestControllerSource['respondWith']>(),
    errorWith: vi.fn<RequestControllerSource['errorWith']>(),
  } satisfies RequestControllerSource
  const emitter = new Emitter<HttpRequestEventMap>()
  const controller = new RequestController(request, source)

  return {
    source,
    emitter,
    handle() {
      return handleRequest({
        initiator: undefined,
        requestId: 'request-id',
        request,
        emitter,
        controller,
      })
    },
  }
}

it('errors the request when aborted while the request is pending', async () => {
  const abortController = new AbortController()
  const { source, emitter, handle } = createRequestHandling(
    abortController.signal
  )

  emitter.on('request', async () => {
    abortController.abort()
    await new Promise(() => {})
  })

  await expect(handle()).resolves.toBeUndefined()

  expect(source.errorWith).toHaveBeenCalledOnce()
  expect(source.respondWith).not.toHaveBeenCalled()
})

it('ignores the abort that happens right after the request has been responded to', async () => {
  const abortController = new AbortController()
  const { source, emitter, handle } = createRequestHandling(
    abortController.signal
  )

  emitter.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
    // Abort the request synchronously after responding to it,
    // before the request handling acknowledges the response.
    abortController.abort()
  })

  await expect(handle()).resolves.toBeUndefined()

  expect(source.respondWith).toHaveBeenCalledOnce()
  expect(source.errorWith).not.toHaveBeenCalled()
})

it('ignores the abort that races with the request being responded to', async () => {
  const abortController = new AbortController()
  const { source, emitter, handle } = createRequestHandling(
    abortController.signal
  )
  const requestListenerCalled = Promise.withResolvers<void>()
  const respondGate = Promise.withResolvers<void>()

  emitter.on('request', async ({ controller }) => {
    requestListenerCalled.resolve()
    await respondGate.promise
    controller.respondWith(new Response('hello world'))
  })

  const handledPromise = handle()
  await requestListenerCalled.promise

  // Release the listener and abort in the same tick so the listener
  // responds after the abort fires but before the handling observes it.
  respondGate.resolve()
  abortController.abort()

  await expect(handledPromise).resolves.toBeUndefined()

  expect(source.respondWith).toHaveBeenCalledOnce()
  expect(source.errorWith).not.toHaveBeenCalled()
})
