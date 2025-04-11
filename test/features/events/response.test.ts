// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import https from 'node:https'
import waitForExpect from 'wait-for-expect'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpRequestEventMap } from '../../../src'
import { XMLHttpRequestInterceptor } from '../../../src/interceptors/XMLHttpRequest'
import { BatchInterceptor } from '../../../src/BatchInterceptor'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'
import { FetchInterceptor } from '../../../src/interceptors/fetch'
import {
  useCors,
  createXMLHttpRequest,
  waitForClientRequest,
} from '../../helpers'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)

  app.get('/user', (_req, res) => {
    res.status(509).send('must-use-mocks')
  })

  app.post('/account', (_req, res) => {
    return res
      .status(200)
      .set('access-control-expose-headers', 'x-response-type')
      .set('x-response-type', 'original')
      .send('original-response-text')
  })
})

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (url.pathname === '/user') {
    controller.respondWith(
      new Response('mocked-response-text', {
        status: 200,
        statusText: 'OK',
        headers: {
          'x-response-type': 'mocked',
        },
      })
    )
  }
})

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners('response')
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('ClientRequest: emits the "response" event for a mocked response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.once('response', responseListener)

  const req = https.request(httpServer.https.url('/user'), {
    method: 'GET',
    headers: {
      'x-request-custom': 'yes',
    },
  })
  req.end()

  const { res } = await waitForClientRequest(req)

  // Must receive a mocked response.
  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  await expect(response.text()).resolves.toBe('mocked-response-text')

  expect(isMockedResponse).toBe(true)
})

it('ClientRequest: emits the "response" event upon the original response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const req = https.request(httpServer.https.url('/account'), {
    method: 'POST',
    headers: {
      'x-request-custom': 'yes',
    },
  })
  req.write('request-body')
  req.end()
  await waitForClientRequest(req)

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/account'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('request-body')

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('original')
  await expect(response.text()).resolves.toBe('original-response-text')

  expect(isMockedResponse).toBe(false)
})

it('XMLHttpRequest: emits the "response" event upon a mocked response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send()
  })

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls.find(([{ request }]) => {
      // The first response event will be from the "OPTIONS" preflight request.
      return request.method === 'GET'
    })!

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  await expect(response.text()).resolves.toBe('mocked-response-text')
  expect(isMockedResponse).toBe(true)

  // Original response.
  expect(originalRequest.responseText).toEqual('mocked-response-text')
})

it('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.url('/account'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send('request-body')
  })

  /**
   * @note The "response" event will be emitted twice because XMLHttpRequest
   * is polyfilled by "http.ClientRequest" in Node.js. When this request will be
   * passthrough to the ClientRequest, it will perform an "OPTIONS" request first,
   * thus two request/response events emitted.
   */
  expect(responseListener).toHaveBeenCalledTimes(2)

  // Lookup the correct response listener call.
  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls.find(([{ request }]) => {
      return request.method === 'POST'
    })!

  expect(request).toBeDefined()
  expect(response).toBeDefined()

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/account'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('request-body')

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('original')
  await expect(response.text()).resolves.toBe('original-response-text')

  expect(isMockedResponse).toBe(false)

  // Original response.
  expect(originalRequest.responseText).toEqual('original-response-text')
})

it('fetch: emits the "response" event upon a mocked response', async () => {
  const responseListenerArgs = new DeferredPromise<
    HttpRequestEventMap['response'][0]
  >()
  interceptor.on('response', (args) => {
    responseListenerArgs.resolve({
      ...args,
      request: args.request.clone(),
    })
  })

  await fetch(httpServer.https.url('/user'), {
    headers: {
      'x-request-custom': 'yes',
    },
  })

  const { response, request, isMockedResponse } = await responseListenerArgs

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  await expect(response.text()).resolves.toBe('mocked-response-text')

  expect(isMockedResponse).toBe(true)
})

it('fetch: emits the "response" event upon the original response', async () => {
  const responseListenerArgs = new DeferredPromise<
    HttpRequestEventMap['response'][0]
  >()
  interceptor.on('response', (args) => {
    responseListenerArgs.resolve({
      ...args,
      request: args.request.clone(),
    })
  })

  await fetch(httpServer.https.url('/account'), {
    method: 'POST',
    headers: {
      'x-request-custom': 'yes',
    },
    body: 'request-body',
  })

  const { response, request, isMockedResponse } = await responseListenerArgs

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/account'))
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('request-body')

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('original')
  await expect(response.text()).resolves.toBe('original-response-text')

  expect(isMockedResponse).toBe(false)
})

it('supports reading the request and response bodies in the "response" listener', async () => {
  const requestCallback = vi.fn()
  const responseCallback = vi.fn()
  const responseListener = vi.fn<
    (...args: HttpRequestEventMap['response']) => void
  >(async ({ request, response }) => {
    requestCallback(await request.clone().text())
    responseCallback(await response.clone().text())
  })
  interceptor.on('response', responseListener)

  await fetch(httpServer.https.url('/user'), {
    method: 'POST',
    body: 'request-body',
  })

  await waitForExpect(() => {
    expect(responseListener).toHaveBeenCalledTimes(1)
  })

  expect(requestCallback).toHaveBeenCalledWith('request-body')
  expect(responseCallback).toHaveBeenCalledWith('mocked-response-text')
})
