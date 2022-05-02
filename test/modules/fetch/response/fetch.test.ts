/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.status(500).json({ error: 'must use mock' })
  })
  app.get('/get', (req, res) => {
    res.status(200).json({ route: '/get' }).end()
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if (
    [httpServer.http.url(), httpServer.https.url()].includes(request.url.href)
  ) {
    request.respondWith({
      status: 201,
      headers: {
        'Content-Type': 'application/hal+json',
      },
      body: JSON.stringify({ mocked: true }),
    })
  }
})

beforeAll(async () => {
  await httpServer.listen()
})

beforeEach(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.dispose()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('responds to an HTTP request that is handled in the middleware', async () => {
  const res = await fetch(httpServer.http.url('/'))
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await fetch(httpServer.http.url('/get'))
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('responds to an HTTPS request that is handled in the middleware', async () => {
  const res = await fetch(httpServer.https.url('/'), {
    agent: httpsAgent,
  })
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await fetch(httpServer.https.url('/get'), {
    agent: httpsAgent,
  })
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()
  const httpRes = await fetch(httpServer.http.url('/'))
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(500)
  expect(httpBody).toEqual({ error: 'must use mock' })

  const httpsRes = await fetch(httpServer.https.url('/'), {
    agent: httpsAgent,
  })
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(500)
  expect(httpsBody).toEqual({ error: 'must use mock' })
})

test('does not throw an error if there are multiple interceptors', async () => {
  const secondInterceptor = new ClientRequestInterceptor()
  secondInterceptor.apply()

  let res = await fetch(httpServer.https.url('/get'), { agent: httpsAgent })
  let body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })

  secondInterceptor.dispose()
})
