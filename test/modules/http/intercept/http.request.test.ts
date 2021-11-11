/**
 * @jest-environment node
 */
import * as http from 'http'
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { IsomorphicRequest } from '../../../../src/createInterceptor'

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
    const handleUserRequest: RequestHandler = (_req, res) => {
      res.status(200).send('user-body').end()
    }
    app.get('/user', handleUserRequest)
    app.post('/user', handleUserRequest)
    app.put('/user', handleUserRequest)
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
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts a GET request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts a POST request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('post-payload')
  })
})

test('intercepts a PUT request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('put-payload')
  })
})

test('intercepts a PATCH request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.body).toEqual('patch-payload')
  })
})

test('intercepts a DELETE request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const request = http.request(
    url,
    {
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
    expect(request.url.href).toEqual(url)
    expect(request.url.searchParams.get('id')).toEqual('123')
    expect(request.headers.get('x-custom-header')).toEqual('yes')
  })
})

test('intercepts an http.request given RequestOptions without a protocol', (done) => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  http
    .request(
      {
        host: httpServer.http.getAddress().host,
        port: httpServer.http.getAddress().port,
        path: '/user?id=123',
      },
      () => done()
    )
    .end(() => {
      expect(requests).toHaveLength(1)

      const [request] = requests
      expect(request.method).toEqual('GET')
      expect(request.url).toBeInstanceOf(URL)
      expect(request.url.href).toEqual(httpServer.http.makeUrl('/user?id=123'))
      expect(request.url.searchParams.get('id')).toEqual('123')
    })
})

test('sets "credentials" to "omit" on the isomorphic request', (done) => {
  http
    .request(httpServer.http.makeUrl('/user'), () => done())
    .end(() => {
      const [request] = requests
      expect(request.credentials).toEqual('omit')
    })
})
