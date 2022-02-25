/**
 * @jest-environment jsdom
 */
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor, IsomorphicRequest, Resolver } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'

let httpServer: ServerApi

const resolver = jest.fn<ReturnType<Resolver>, Parameters<Resolver>>()
const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver,
})

beforeAll(async () => {
  // @ts-expect-error Internal jsdom global property.
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  httpServer = await createServer((app) => {
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

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('intercepts an HTTP HEAD request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTP GET request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTP POST request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'post-payload',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTP PUT request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'put-payload',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTP DELETE request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTPS HEAD request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTPS GET request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTPS POST request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'post-payload',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTPS PUT request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'put-payload',
    },
    expect.any(XMLHttpRequest)
  )
})

test('intercepts an HTTPS DELETE request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(XMLHttpRequest)
  )
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
    req.withCredentials = true
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'include',
    }),
    expect.any(XMLHttpRequest)
  )
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'omit',
    }),
    expect.any(XMLHttpRequest)
  )
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
    req.withCredentials = false
    req.send()
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith(
    expect.objectContaining<Partial<IsomorphicRequest>>({
      credentials: 'omit',
    }),
    expect.any(XMLHttpRequest)
  )
})
