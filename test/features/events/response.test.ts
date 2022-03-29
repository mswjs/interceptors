/**
 * @jest-environment jsdom
 */
import * as https from 'https'
import fetch from 'node-fetch'
import waitForExpect from 'wait-for-expect'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import {
  createInterceptor,
  InterceptorEventsMap,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../../src'
import nodeInterceptors from '../../../src/presets/node'
import { createXMLHttpRequest, waitForClientRequest } from '../../helpers'
import { anyUuid, headersContaining } from '../../jest.expect'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(event) {
    if (event.request.url.pathname === '/user') {
      event.respondWith({
        status: 200,
        headers: {
          'x-response-type': 'mocked',
        },
        body: 'mocked-response-text',
      })
    }
  },
})

const responseListener = jest.fn<
  ReturnType<InterceptorEventsMap['response']>,
  Parameters<InterceptorEventsMap['response']>
>()
interceptor.on('response', responseListener)

beforeAll(async () => {
  // @ts-expect-error Internal JSDOM property.
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  httpServer = await createServer((app) => {
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

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('ClientRequest: emits the "response" event upon a mocked response', async () => {
  const req = https.request(httpServer.https.url('/user'), {
    method: 'GET',
    headers: {
      'x-request-custom': 'yes',
    },
  })
  req.end()
  const { text } = await waitForClientRequest(req)

  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'mocked',
      }),
      body: 'mocked-response-text',
    }
  )

  expect(await text()).toEqual('mocked-response-text')
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
  const { text } = await waitForClientRequest(req)

  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      body: 'request-body',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'original',
      }),
      body: 'original-response-text',
    }
  )

  expect(await text()).toEqual('original-response-text')
})

test('XMLHttpRequest: emits the "response" event upon a mocked response', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send()
  })

  expect(responseListener).toHaveBeenCalledTimes(1)
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'mocked',
      }),
      body: 'mocked-response-text',
    }
  )

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
   * @note There are two requests that happen:
   * - OPTIONS /account
   * - POST /account
   */
  expect(responseListener).toHaveBeenCalledTimes(2)
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'omit',
      body: 'request-body',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'original',
      }),
      body: 'original-response-text',
    }
  )

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
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'mocked',
      }),
      body: 'mocked-response-text',
    }
  )
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
  expect(responseListener).toHaveBeenCalledWith<
    [IsomorphicRequest, IsomorphicResponse]
  >(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/account')),
      headers: headersContaining({
        'x-request-custom': 'yes',
      }),
      credentials: 'same-origin',
      body: 'request-body',
    },
    {
      status: 200,
      statusText: 'OK',
      headers: headersContaining({
        'x-response-type': 'original',
      }),
      body: 'original-response-text',
    }
  )
})
