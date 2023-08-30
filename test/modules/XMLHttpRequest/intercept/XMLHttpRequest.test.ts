// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import type { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import {
  XMLHttpRequestEventListener,
  XMLHttpRequestInterceptor,
} from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors, UUID_REGEXP } from '../../../helpers'
import { toArrayBuffer, encodeBuffer } from '../../../../src/utils/bufferUtils'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  app.use(useCors, (req, res, next) => {
    res.set({
      'Access-Control-Allow-Credentials': 'true',
    })
    return next()
  })

  const handleUserRequest: RequestHandler = (_req, res) => {
    res.status(200).send('user-body').end()
  }

  app.get('/user', handleUserRequest)
  app.post('/user', handleUserRequest)
  app.put('/user', handleUserRequest)
  app.delete('/user', handleUserRequest)
  app.patch('/user', handleUserRequest)
  app.head('/user', handleUserRequest)
})

const resolver = vi.fn<Parameters<XMLHttpRequestEventListener>>()

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  await httpServer.listen()

  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an HTTP HEAD request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTP GET request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTP POST request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('post-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTP PUT request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('put-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTP DELETE request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTPS HEAD request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTPS GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTPS POST request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('post-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTPS PUT request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('put-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an HTTPS DELETE request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(url)
  expect(Object.fromEntries(request.headers.entries())).toContain({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = true
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request }] = resolver.mock.calls[0]
  expect(request.credentials).toBe('include')
})

it('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  const [{ request }] = resolver.mock.calls[0]
  expect(request.credentials).toBe('same-origin')
})

it('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = false
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  const [{ request }] = resolver.mock.calls[0]
  expect(request.credentials).toBe('same-origin')
})

it('responds with an ArrayBuffer when "responseType" equals "arraybuffer"', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', httpServer.https.url('/user'))
    request.responseType = 'arraybuffer'
    request.send()
  })

  const expectedArrayBuffer = toArrayBuffer(encodeBuffer('user-body'))
  const responseBuffer = request.response as ArrayBuffer

  // Must return an "ArrayBuffer" instance for "arraybuffer" response type.
  expect(request.responseType).toBe('arraybuffer')
  expect(responseBuffer).toBeInstanceOf(ArrayBuffer)
  expect(responseBuffer.byteLength).toBe(expectedArrayBuffer.byteLength)
  expect(
    Buffer.from(responseBuffer).compare(Buffer.from(expectedArrayBuffer))
  ).toBe(0)
})
