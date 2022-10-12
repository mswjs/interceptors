/**
 * @jest-environment jsdom
 */
import * as https from 'https'
import fetch from 'node-fetch'
import waitForExpect from 'wait-for-expect'
import { Response } from '@remix-run/web-fetch'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../src'
import { createXMLHttpRequest, waitForClientRequest } from '../../helpers'
import { anyUuid, headersContaining } from '../../jest.expect'
import { XMLHttpRequestInterceptor } from '../../../src/interceptors/XMLHttpRequest'
import { BatchInterceptor } from '../../../src/BatchInterceptor'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'
import { encodeBuffer } from '../../../src/utils/bufferUtils'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  app.get('/user', (_req, res) => {
    res.status(500).send('must-use-mocks')
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
  ],
})

interceptor.on('request', (request) => {
  const url = new URL(request.url)

  if (url.pathname === '/user') {
    request.respondWith(
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

const responseListener = jest.fn<
  ReturnType<HttpRequestEventMap['response']>,
  Parameters<HttpRequestEventMap['response']>
>()
interceptor.on('response', responseListener)

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('ClientRequest: emits the "response" event for a mocked response', async () => {
  const req = https.request(httpServer.https.url('/user'), {
    method: 'GET',
    headers: {
      'x-request-custom': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [request, response] = responseListener.mock.calls[0]

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(await response.text()).toBe('mocked-response-text')
})

test('ClientRequest: emits the "response" event upon the original response', async () => {
  const req = https.request(httpServer.https.url('/account'), {
    method: 'POST',
    headers: {
      'x-request-custom': 'yes',
    },
    agent: httpsAgent,
  })
  req.write('request-body')
  req.end()
  await waitForClientRequest(req)

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [request, response] = responseListener.mock.calls[0]

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('request-body'),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('original')
  expect(await response.text()).toBe('original-response-text')
})

test('XMLHttpRequest: emits the "response" event upon a mocked response', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send()
  })

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [request, response] = responseListener.mock.calls.find((call) => {
    return call[0].method === 'GET'
  })!

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(await response.text()).toBe('mocked-response-text')

  // Original response.
  expect(originalRequest.responseText).toEqual('mocked-response-text')
})

test('XMLHttpRequest: emits the "response" event upon the original response', async () => {
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
  const [request, response] = responseListener.mock.calls.find((call) => {
    return call[0].method === 'POST'
  })!

  expect(request).toBeDefined()
  expect(response).toBeDefined()

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer('request-body'),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('original')
  expect(await response.text()).toBe('original-response-text')

  // Original response.
  expect(originalRequest.responseText).toEqual('original-response-text')
})

test('fetch: emits the "response" event upon a mocked response', async () => {
  await fetch(httpServer.https.url('/user'), {
    headers: {
      'x-request-custom': 'yes',
    },
  })

  expect(responseListener).toHaveBeenCalledTimes(1)

  const [request, response] = responseListener.mock.calls[0]

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(await response.text()).toBe('mocked-response-text')
})

test('fetch: emits the "response" event upon the original response', async () => {
  await fetch(httpServer.https.url('/account'), {
    agent: httpsAgent,
    method: 'POST',
    headers: {
      'x-request-custom': 'yes',
    },
    body: 'request-body',
  })

  await waitForExpect(() => {
    expect(responseListener).toHaveBeenCalledTimes(1)
  })

  const [request, response] = responseListener.mock.calls[0]

  expect(request).toEqual(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('request-body'),
    })
  )

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-response-type')).toBe('original')
  expect(await response.text()).toBe('original-response-text')
})
