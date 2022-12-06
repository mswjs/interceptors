/**
 * @jest-environment jsdom
 */
import type { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { encodeBuffer } from '../../../../src'
import {
  XMLHttpRequestEventListener,
  XMLHttpRequestInterceptor,
} from '../../../../src/interceptors/XMLHttpRequest'
import { toArrayBuffer } from '../../../../src/utils/bufferUtils'
import { createXMLHttpRequest } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  const handleUserRequest: RequestHandler = (_req, res) => {
    res.status(200).send('user-body')
  }

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Credentials', 'true')

    next()
  })

  // @ts-ignore
  app.head('/user', handleUserRequest)
  // @ts-ignore
  app.get('/user', handleUserRequest)
  // @ts-ignore
  app.post('/user', handleUserRequest)
  // @ts-ignore
  app.put('/user', handleUserRequest)
  // @ts-ignore
  app.patch('/user', handleUserRequest)
  // @ts-ignore
  app.delete('/user', handleUserRequest)
})

const resolver = jest.fn<never, Parameters<XMLHttpRequestEventListener>>()

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', resolver)

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

test('intercepts an HTTP HEAD request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTP GET request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTP POST request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(await request.text()).toBe('post-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTP PUT request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(await request.text()).toBe('put-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTP DELETE request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTPS HEAD request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTPS GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTPS POST request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(await request.text()).toBe('post-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTPS PUT request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(await request.text()).toBe('put-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an HTTPS DELETE request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('omit')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = true
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request] = resolver.mock.calls[0]
  expect(request.credentials).toBe('include')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  const [request] = resolver.mock.calls[0]
  expect(request.credentials).toBe('omit')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = false
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  const [request] = resolver.mock.calls[0]
  expect(request.credentials).toBe('omit')
})

test('responds with an ArrayBuffer when "responseType" equals "arraybuffer"', async () => {
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
