/**
 * @jest-environment node
 */
import * as http from 'http'
import { RequestHandler } from 'express'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { httpRequest, prepare } from '../../helpers'
import { IsomoprhicRequest } from '../../../src/createInterceptor'
import { getIncomingMessageBody } from '../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'

let pool: IsomoprhicRequest[] = []
let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    pool.push(request)
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    const handleUserRequest: RequestHandler = (req, res) => {
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
  pool = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('intercepts HTTP GET request', async () => {
  const request = await prepare(
    httpRequest(server.http.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP POST request', async () => {
  const request = await prepare(
    httpRequest(
      server.http.makeUrl('/user?id=123'),
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
      },
      'request-body'
    ),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PUT request', async () => {
  const request = await prepare(
    httpRequest(
      server.http.makeUrl('/user?id=123'),
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
      },
      'request-body'
    ),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP DELETE request', async () => {
  const request = await prepare(
    httpRequest(server.http.makeUrl('/user?id=123'), {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PATCH request', async () => {
  const request = await prepare(
    httpRequest(server.http.makeUrl('/user?id=123'), {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP HEAD request', async () => {
  const request = await prepare(
    httpRequest(server.http.makeUrl('/user?id=123'), {
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an http.request request given RequestOptions without a protocol', (done) => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const request = http.request(
    {
      host: server.http.getAddress().host,
      port: server.http.getAddress().port,
      path: '/user',
    },
    async (response) => {
      const responseBody = await getIncomingMessageBody(response)
      expect(responseBody).toBe('user-body')

      done()
    }
  )

  request.end()
})
