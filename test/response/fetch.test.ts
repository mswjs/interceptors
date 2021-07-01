/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import nodeInterceptors from '../../src/presets/node'

let server: ServerApi

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(request) {
    if (
      [server.http.makeUrl(), server.https.makeUrl()].includes(request.url.href)
    ) {
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).json({ route: '/' }).end()
    })
    app.get('/get', (req, res) => {
      res.status(200).json({ route: '/get' }).end()
    })
  })
})

beforeEach(() => {
  interceptor.apply()
})

afterEach(async () => {
  interceptor.restore()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('responds to an HTTP request that is handled in the middleware', async () => {
  const res = await fetch(server.http.makeUrl('/'))
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await fetch(server.http.makeUrl('/get'))
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('responds to an HTTPS request that is handled in the middleware', async () => {
  const res = await fetch(server.https.makeUrl('/'), { agent: httpsAgent })
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await fetch(server.https.makeUrl('/get'), { agent: httpsAgent })
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const httpRes = await fetch(server.http.makeUrl('/'))
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(200)
  expect(httpBody).toEqual({ route: '/' })

  const httpsRes = await fetch(server.https.makeUrl('/'), { agent: httpsAgent })
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(200)
  expect(httpsBody).toEqual({ route: '/' })
})

test('does not throw an error if there are multiple interceptors', async () => {
  const secondInterceptor = createInterceptor({
    modules: nodeInterceptors,
    resolver() {},
  })
  secondInterceptor.apply()

  let res = await fetch(server.https.makeUrl('/get'), { agent: httpsAgent })
  let body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })

  secondInterceptor.restore()
})
