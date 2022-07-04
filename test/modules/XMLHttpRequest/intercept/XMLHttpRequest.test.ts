/**
 * @jest-environment jsdom
 */
import type { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { IsomorphicRequest } from '../../../../src'
import {
  XMLHttpRequestEventListener,
  XMLHttpRequestInterceptor,
} from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP GET request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP POST request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer('post-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP PUT request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer('put-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP DELETE request', async () => {
  const url = httpServer.http.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS HEAD request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS POST request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer('post-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS PUT request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer('put-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS DELETE request', async () => {
  const url = httpServer.https.url('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<XMLHttpRequestEventListener>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = true
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'include',
    })
  )
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'omit',
    })
  )
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/user'))
    req.withCredentials = false
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'omit',
    })
  )
})
