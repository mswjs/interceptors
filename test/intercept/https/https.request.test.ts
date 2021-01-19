/**
 * @jest-environment node
 */
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsRequest } from '../../helpers'

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
    app.delete('/user', handleUserRequest)
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

test('intercepts an HTTPS GET request', async () => {
  const request = await prepare(
    httpsRequest(server.https.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS POST request', async () => {
  const request = await prepare(
    httpsRequest(
      server.https.makeUrl('/user?id=123'),
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
        agent: httpsAgent,
      },
      'request-body'
    ),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PUT request', async () => {
  const request = await prepare(
    httpsRequest(
      server.https.makeUrl('/user?id=123'),
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
        agent: httpsAgent,
      },
      'request-body'
    ),
    pool
  )
  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepare(
    httpsRequest(server.https.makeUrl('/user?id=123'), {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PATCH request', async () => {
  const request = await prepare(
    httpsRequest(server.https.makeUrl('/user?id=123'), {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS HEAD request', async () => {
  const request = await prepare(
    httpsRequest(server.https.makeUrl('/user?id=123'), {
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})
