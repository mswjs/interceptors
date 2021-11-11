/**
 * @jest-environment node
 */
import * as undici from 'undici'
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { IsomorphicRequest } from '../../../src/createInterceptor'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'

let requests: IsomorphicRequest[] = []
let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    requests.push(request)
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    const handleUserRequest: RequestHandler = (req, res) => {
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
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('intercepts a HEAD request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('HEAD')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts a GET request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('GET')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts a POST request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'post-payload',
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('POST')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
  expect(request.body).toEqual('post-payload')
})

test('intercepts a PUT request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'put-payload',
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('PUT')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
  expect(request.body).toEqual('put-payload')
})

test('intercepts a PATCH request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'patch-payload',
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('PATCH')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
  expect(request.body).toEqual('patch-payload')
})

test('intercepts a DELETE request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  await undici.request(url, {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(requests).toHaveLength(1)

  const [request] = requests
  expect(request.method).toEqual('DELETE')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
  expect(request.url.searchParams.get('id')).toEqual('123')
  expect(request.headers.get('x-custom-header')).toEqual('yes')
})

test('sets "credentials" to "omit" on the isomorphic request', async () => {
  await undici.request(httpServer.http.makeUrl('/user'))

  const [request] = requests
  expect(request.credentials).toEqual('omit')
})
