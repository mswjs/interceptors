/**
 * @jest-environment node
 */
import { RequestHandler } from 'express'
import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { httpRequest, prepare } from '../../helpers'

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerApi

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

  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(async () => {
  requestInterceptor.restore()
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
