/**
 * @jest-environment node
 */
import * as https from 'https'
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
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

test('intercepts a HEAD request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('HEAD')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts a GET request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'GET',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('GET')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts a POST request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.write('post-payload')
  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('POST')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('post-payload')
  })
})

test('intercepts a PUT request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.write('put-payload')
  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('PUT')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('put-payload')
  })
})

test('intercepts a PATCH request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.write('patch-payload')
  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('PATCH')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('patch-payload')
  })
})

test('intercepts a DELETE request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const request = https.request(
    url,
    {
      agent: httpsAgent,
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => done()
  )

  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('DELETE')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts an http.request request given RequestOptions without a protocol', (done) => {
  const request = https.request(
    {
      agent: httpsAgent,
      host: httpServer.https.getAddress().host,
      port: httpServer.https.getAddress().port,
      path: '/user?id=123',
    },
    () => done()
  )

  request.end(() => {
    expect(requests).toHaveLength(1)

    const [request] = requests
    expect(request.method).toEqual('GET')
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toEqual('123')
  })
})
