/**
 * @note https://xhr.spec.whatwg.org/#event-handlers
 */
// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('hello')
  })
  app.get('/error-response', (req, res) => {
    res.status(500).send('Internal Server Error')
  })
  app.get('/exception', (req, res) => {
    throw new Error('Server error')
  })
})

beforeAll(async () => {
  interceptor.apply()
  interceptor.on('request', ({ request, controller }) => {
    switch (true) {
      case request.url.endsWith('/exception'): {
        throw new Error('Custom error')
      }

      case request.url.endsWith('/network-error'): {
        return controller.respondWith(Response.error())
      }

      case request.url.endsWith('/error-response'): {
        return controller.respondWith(
          new Response('Internal Server Error', { status: 500 })
        )
      }

      default:
        return controller.respondWith(new Response('hello'))
    }
  })

  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/resource')],
  ['mocked', () => 'http://localhost/resource'],
])(
  `dispatches relevant events upon a successful %s response`,
  async (_, getUrl) => {
    const url = getUrl()

    const onReadyStateChangeHandler = vi.fn(function (this: XMLHttpRequest) {
      return this.readyState
    })
    const onLoadStartHandler = vi.fn()
    const onProgressHandler = vi.fn()
    const onLoadHandler = vi.fn()
    const onLoadEndHandler = vi.fn()

    const onReadyStateChangeListener = vi.fn(function (this: XMLHttpRequest) {
      return this.readyState
    })
    const loadStartListener = vi.fn()
    const progressListener = vi.fn()
    const loadListener = vi.fn()
    const loadEndListener = vi.fn()

    const request = await createXMLHttpRequest((request) => {
      request.open('GET', url)

      request.onreadystatechange = onReadyStateChangeHandler
      request.onloadstart = onLoadStartHandler
      request.onprogress = onProgressHandler
      request.onload = onLoadHandler
      request.onloadend = onLoadEndHandler

      request.addEventListener('readystatechange', onReadyStateChangeListener)
      request.addEventListener('loadstart', loadStartListener)
      request.addEventListener('progress', progressListener)
      request.addEventListener('load', loadListener)
      request.addEventListener('loadend', loadEndListener)

      request.send()
    })

    expect(request.readyState).toBe(4)
    expect(request.status).toBe(200)
    expect(request.responseText).toBe('hello')

    expect(onReadyStateChangeHandler).toHaveBeenCalledTimes(3)
    expect(onReadyStateChangeHandler).toHaveNthReturnedWith(1, 2)
    expect(onReadyStateChangeHandler).toHaveNthReturnedWith(2, 3)
    expect(onReadyStateChangeHandler).toHaveNthReturnedWith(3, 4)
    expect(onLoadStartHandler).toHaveBeenCalledTimes(1)
    expect(onProgressHandler).toHaveBeenCalledTimes(1)
    expect(onLoadHandler).toHaveBeenCalledTimes(1)
    expect(onLoadEndHandler).toHaveBeenCalledTimes(1)

    expect(onReadyStateChangeListener).toHaveBeenCalledTimes(3)
    expect(onReadyStateChangeListener).toHaveNthReturnedWith(1, 2)
    expect(onReadyStateChangeListener).toHaveNthReturnedWith(2, 3)
    expect(onReadyStateChangeListener).toHaveNthReturnedWith(3, 4)
    expect(loadStartListener).toHaveBeenCalledTimes(1)
    expect(progressListener).toHaveBeenCalledTimes(1)
    expect(loadListener).toHaveBeenCalledTimes(1)
    expect(loadEndListener).toHaveBeenCalledTimes(1)
  }
)

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/error-response')],
  ['mocked', () => 'http://localhost/error-response'],
])(`dispatches relevant events upon a %s error response`, async (_, getUrl) => {
  const url = getUrl()

  const onReadyStateChangeHandler = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const onLoadStartHandler = vi.fn()
  const onProgressHandler = vi.fn()
  const onLoadHandler = vi.fn()
  const onLoadEndHandler = vi.fn()

  const onReadyStateChangeListener = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const loadStartListener = vi.fn()
  const progressListener = vi.fn()
  const loadListener = vi.fn()
  const loadEndListener = vi.fn()

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', url)

    request.onreadystatechange = onReadyStateChangeHandler
    request.onloadstart = onLoadStartHandler
    request.onprogress = onProgressHandler
    request.onload = onLoadHandler
    request.onloadend = onLoadEndHandler

    request.addEventListener('readystatechange', onReadyStateChangeListener)
    request.addEventListener('loadstart', loadStartListener)
    request.addEventListener('progress', progressListener)
    request.addEventListener('load', loadListener)
    request.addEventListener('loadend', loadEndListener)

    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.responseText).toBe('Internal Server Error')

  expect(onReadyStateChangeHandler).toHaveBeenCalledTimes(3)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(1, 2)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(2, 3)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(3, 4)
  expect(onLoadStartHandler).toHaveBeenCalledTimes(1)
  expect(onProgressHandler).toHaveBeenCalledTimes(1)
  expect(onLoadHandler).toHaveBeenCalledTimes(1)
  expect(onLoadEndHandler).toHaveBeenCalledTimes(1)

  expect(onReadyStateChangeListener).toHaveBeenCalledTimes(3)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(1, 2)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(2, 3)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(3, 4)
  expect(loadStartListener).toHaveBeenCalledTimes(1)
  expect(progressListener).toHaveBeenCalledTimes(1)
  expect(loadListener).toHaveBeenCalledTimes(1)
  expect(loadEndListener).toHaveBeenCalledTimes(1)
})

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/network-error')],
  ['mocked', () => 'http://localhost/network-error'],
])(`dispatches relevant events upon a %s request error`, async (_, getUrl) => {
  const url = getUrl()

  const onReadyStateChangeHandler = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const onLoadStartHandler = vi.fn()
  const onProgressHandler = vi.fn()
  const onLoadHandler = vi.fn()
  const onLoadEndHandler = vi.fn()

  const onReadyStateChangeListener = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const loadStartListener = vi.fn()
  const progressListener = vi.fn()
  const loadListener = vi.fn()
  const loadEndListener = vi.fn()

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', url)

    request.onreadystatechange = onReadyStateChangeHandler
    request.onloadstart = onLoadStartHandler
    request.onprogress = onProgressHandler
    request.onload = onLoadHandler
    request.onloadend = onLoadEndHandler

    request.addEventListener('readystatechange', onReadyStateChangeListener)
    request.addEventListener('loadstart', loadStartListener)
    request.addEventListener('progress', progressListener)
    request.addEventListener('load', loadListener)
    request.addEventListener('loadend', loadEndListener)

    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(0)
  expect(request.responseText).toBe('')

  expect(onReadyStateChangeHandler).toHaveBeenCalledTimes(1)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(1, 4)
  expect(onLoadStartHandler).not.toHaveBeenCalled()
  expect(onProgressHandler).not.toHaveBeenCalled()
  expect(onLoadHandler).not.toHaveBeenCalled()
  expect(onLoadEndHandler).toHaveBeenCalledTimes(1)

  expect(onReadyStateChangeListener).toHaveBeenCalledTimes(1)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(1, 4)
  expect(loadStartListener).not.toHaveBeenCalled()
  expect(progressListener).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
  expect(loadEndListener).toHaveBeenCalledTimes(1)
})

it('dispatched relevant events upon an unhandled exception in the interceptor', async () => {
  const onReadyStateChangeHandler = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const onLoadStartHandler = vi.fn()
  const onProgressHandler = vi.fn()
  const onLoadHandler = vi.fn()
  const onLoadEndHandler = vi.fn()
  const onErrorHandler = vi.fn()

  const onReadyStateChangeListener = vi.fn(function (this: XMLHttpRequest) {
    return this.readyState
  })
  const loadStartListener = vi.fn()
  const progressListener = vi.fn()
  const loadListener = vi.fn()
  const loadEndListener = vi.fn()
  const errorListener = vi.fn()

  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'

    request.onreadystatechange = onReadyStateChangeHandler
    request.onloadstart = onLoadStartHandler
    request.onprogress = onProgressHandler
    request.onload = onLoadHandler
    request.onloadend = onLoadEndHandler
    request.onerror = onErrorHandler

    request.addEventListener('readystatechange', onReadyStateChangeListener)
    request.addEventListener('loadstart', loadStartListener)
    request.addEventListener('progress', progressListener)
    request.addEventListener('load', loadListener)
    request.addEventListener('loadend', loadEndListener)
    request.addEventListener('error', errorListener)

    // Open the connection after the callbacks/listeners have been added.
    // Some XHR interactions, like file uploads, require you to add the
    // progress listeners BEFORE the request is open.
    request.open('GET', httpServer.https.url('/exception'))
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })

  expect(onReadyStateChangeHandler).toHaveBeenCalledTimes(4)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(1, 1)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(2, 2)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(3, 3)
  expect(onReadyStateChangeHandler).toHaveNthReturnedWith(4, 4)
  expect(onLoadStartHandler).toHaveBeenCalledTimes(1)
  expect(onProgressHandler).toHaveBeenCalledTimes(1)
  expect(onLoadHandler).toHaveBeenCalledTimes(1)
  expect(onLoadEndHandler).toHaveBeenCalledTimes(1)
  expect(onErrorHandler).not.toHaveBeenCalled()

  expect(onReadyStateChangeListener).toHaveBeenCalledTimes(4)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(1, 1)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(2, 2)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(3, 3)
  expect(onReadyStateChangeListener).toHaveNthReturnedWith(4, 4)
  expect(loadStartListener).toHaveBeenCalledTimes(1)
  expect(progressListener).toHaveBeenCalledTimes(1)
  expect(loadListener).toHaveBeenCalledTimes(1)
  expect(loadEndListener).toHaveBeenCalledTimes(1)
  expect(errorListener).not.toHaveBeenCalled()
})
