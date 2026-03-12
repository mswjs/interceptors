// @vitest-environment happy-dom
import https from 'node:https'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor, HttpRequestEventMap } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { toWebResponse } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  vi.clearAllMocks()
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
  vi.restoreAllMocks()
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
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.once('response', responseListener)

  const req = https.request(server.https.url('/user'), {
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
    const [{ response, request, responseType }] = responseListener.mock.calls[0]

    expect(request.method).toBe('GET')
    expect(request.url).toBe(server.https.url('/user').href)
    expect(request.headers.get('x-request-custom')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(request.body).toBe(null)

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.url).toBe(request.url)
    expect(response.headers.get('x-response-type')).toBe('mocked')
    await expect(response.text()).resolves.toBe('mocked-response-text')

    expect(responseType).toBe('mock')
  }
})

it('ClientRequest: emits the "response" event upon the original response', async () => {
  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const req = https.request(server.https.url('/account'), {
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

  const [{ response, request, responseType }] = responseListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(server.https.url('/account').href)
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('request-body')

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('original')
  await expect(response.text()).resolves.toBe('original-response-text')

  expect(responseType).toBe('original')
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
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = 'http://any.host.here/resource'
  const request = new XMLHttpRequest()
  request.open('GET', url)
  request.setRequestHeader('x-request-custom', 'yes')
  request.send()

  await waitForXMLHttpRequest(request)

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
  expect(request.responseText).toBe('mocked-response-text')

  {
    const [{ response, request, responseType }] = responseListener.mock.calls[1]

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
    expect(responseType).toBe('mocked')
  }
})

it('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = server.http.url('/account')
  const request = new XMLHttpRequest()
  request.open('POST', url)
  request.setRequestHeader('x-request-custom', 'yes')
  request.send('request-body')

  await waitForXMLHttpRequest(request)

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
  expect(request.responseText).toBe('original-response-text')

  {
    const [{ response, request, responseType }] = responseListener.mock.calls[1]

    expect(request).toBeDefined()
    expect(response).toBeDefined()

    expect(request.method).toBe('POST')
    expect(request.url).toBe(url.href)
    expect(request.headers.get('x-request-custom')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(request.text()).resolves.toBe('request-body')

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.url).toBe(request.url)
    expect(response.headers.get('x-response-type')).toBe('original')
    await expect(response.text()).resolves.toBe('original-response-text')

    expect(responseType).toBe('original')
  }
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
    HttpRequestEventMap['response']
  >()
  interceptor.on('response', (event) => {
    responseListenerArgs.resolve({
      ...event,
      request: event.request.clone(),
    })
  })

  await fetch(server.https.url('/user'), {
    headers: {
      'x-request-custom': 'yes',
    },
  })

  const { response, request, responseType } = await responseListenerArgs

  expect(request.method).toBe('GET')
  expect(request.url).toBe(server.https.url('/user').href)
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.url).toBe(request.url)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  await expect(response.text()).resolves.toBe('mocked-response-text')

  expect(responseType).toBe('mock')
})

it(
  'fetch: emits the "response" event upon the original response',
  { timeout: 1500 },
  async () => {
    interceptor.on('request', ({ initiator, request }) => {
      console.log(request.method, request.url, initiator?.constructor?.name)

      if (request.method === 'OPTIONS') {
        console.trace('fetch options?!')
      }
    })

    const responseListenerArgs = new DeferredPromise<
      HttpRequestEventMap['response']
    >()
    interceptor.on('response', (args) => {
      responseListenerArgs.resolve({
        ...args,
        request: args.request.clone(),
      })
    })

    await fetch(server.http.url('/account'), {
      method: 'POST',
      headers: {
        'x-request-custom': 'yes',
      },
      body: 'request-body',
    })

    const { response, request, responseType } = await responseListenerArgs

    expect(request.method).toBe('POST')
    expect(request.url).toBe(server.http.url('/account').href)
    expect(request.headers.get('x-request-custom')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(request.text()).resolves.toBe('request-body')

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.url).toBe(request.url)
    expect(response.headers.get('x-response-type')).toBe('original')
    await expect(response.text()).resolves.toBe('original-response-text')

    expect(responseType).toBe('original')
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

  await fetch(server.https.url('/user'), {
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
