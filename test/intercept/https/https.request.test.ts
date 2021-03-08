/**
 * @jest-environment node
 */
import * as https from 'https'
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { IsomoprhicRequest } from '../../../src/createInterceptor'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { prepare, httpsRequest } from '../../helpers'
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
    app.delete('/user', handleUserRequest)
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

test('intercepts an http.request request given RequestOptions without a protocol', (done) => {
  const request = https.request(
    {
      host: server.https.getAddress().host,
      port: server.https.getAddress().port,
      path: '/user',
      // Suppress the "certificate has expired" error.
      rejectUnauthorized: false,
    },
    async (response) => {
      const responseBody = await getIncomingMessageBody(response)
      expect(responseBody).toBe('user-body')

      done()
    }
  )

  request.end()
})
