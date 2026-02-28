// @vitest-environment jsdom
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpRequestEventMap } from '#/src/index'
import { BatchInterceptor } from '#/src/BatchInterceptor'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest/node'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { useCors, createXMLHttpRequest, toWebResponse } from '#/test/helpers'

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
  interceptors: [new HttpRequestInterceptor(), new XMLHttpRequestInterceptor()],
})

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.clearAllMocks()
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  vi.restoreAllMocks()
  await httpServer.close()
})

it('ClientRequest: emits the "response" event for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mocked-response-text', {
        statusText: 'OK',
        headers: { 'x-response-type': 'mocked' },
      })
    )
  })

  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.once('response', responseListener)

  const req = https.request(httpServer.https.url('/user'), {
    method: 'GET',
    headers: {
      'x-request-custom': 'yes',
    },
    rejectUnauthorized: false,
  })
  req.end()

  const [response] = await toWebResponse(req)

  // Must receive a mocked response.
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')

  expect(responseListener).toHaveBeenCalledOnce()

  {
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
  }
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
    rejectUnauthorized: false,
  })
  req.write('request-body')
  req.end()
  await toWebResponse(req)

  expect(responseListener).toHaveBeenCalledOnce()

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
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'x-request-custom',
          },
        })
      )
    }

    controller.respondWith(
      new Response('mocked-response-text', {
        statusText: 'OK',
        headers: {
          'access-control-allow-origin': '*',
          'x-response-type': 'mocked',
        },
      })
    )
  })

  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = 'http://any.host.here/resource'
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-request-custom', 'yes')
    req.send()
  })

  expect(responseListener).toHaveBeenCalledTimes(2)
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      request: expect.objectContaining({ method: 'OPTIONS', url }),
    })
  )
  expect(responseListener).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      request: expect.objectContaining({ method: 'GET', url }),
    })
  )

  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls[1]

  expect.soft(request.method).toBe('GET')
  expect.soft(request.url).toBe(url)
  expect.soft(request.headers.get('x-request-custom')).toBe('yes')
  expect.soft(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect.soft(response.status).toBe(200)
  expect.soft(response.statusText).toBe('OK')
  expect.soft(response.url).toBe(request.url)
  expect.soft(response.headers.get('x-response-type')).toBe('mocked')
  await expect(response.text()).resolves.toBe('mocked-response-text')
  expect(isMockedResponse).toBe(true)

  expect(originalRequest.responseText).toBe('mocked-response-text')
})

it('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = httpServer.https.url('/account')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-request-custom', 'yes')
    req.send('request-body')
  })

  expect(responseListener).toHaveBeenCalledTimes(2)
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      request: expect.objectContaining({ method: 'OPTIONS', url }),
    })
  )
  expect(responseListener).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      request: expect.objectContaining({ method: 'POST', url }),
    })
  )

  const [{ response, request, isMockedResponse }] =
    responseListener.mock.calls[1]

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

  expect(originalRequest.responseText).toBe('original-response-text')
})

it('fetch: emits the "response" event upon a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mocked-response-text', {
        statusText: 'OK',
        headers: {
          'x-response-type': 'mocked',
        },
      })
    )
  })

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

it(
  'fetch: emits the "response" event upon the original response',
  { timeout: 1500 },
  async () => {
    const responseListenerArgs = new DeferredPromise<
      HttpRequestEventMap['response'][0]
    >()
    interceptor.on('response', (args) => {
      responseListenerArgs.resolve({
        ...args,
        request: args.request.clone(),
      })
    })

    await fetch(httpServer.http.url('/account'), {
      method: 'POST',
      headers: {
        'x-request-custom': 'yes',
      },
      body: 'request-body',
    })

    const { response, request, isMockedResponse } = await responseListenerArgs

    expect(request.method).toBe('POST')
    expect(request.url).toBe(httpServer.http.url('/account'))
    expect(request.headers.get('x-request-custom')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(request.text()).resolves.toBe('request-body')

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.url).toBe(request.url)
    expect(response.headers.get('x-response-type')).toBe('original')
    await expect(response.text()).resolves.toBe('original-response-text')

    expect(isMockedResponse).toBe(false)
  }
)

it('supports reading the request and response bodies in the "response" listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mocked-response-text', {
        statusText: 'OK',
        headers: {
          'x-response-type': 'mocked',
        },
      })
    )
  })

  const requestCallback = vi.fn()
  const responseCallback = vi.fn()

  interceptor.on('response', async ({ request, response }) => {
    requestCallback(await request.clone().text())
    responseCallback(await response.clone().text())
  })

  await fetch(httpServer.https.url('/user'), {
    method: 'POST',
    body: 'request-body',
  })

  await expect
    .poll(() => requestCallback)
    .toHaveBeenCalledExactlyOnceWith('request-body')
  await expect
    .poll(() => responseCallback)
    .toHaveBeenCalledExactlyOnceWith('mocked-response-text')
})
