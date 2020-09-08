/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { ServerAPI, createServer, httpsAgent } from '../utils/createServer'

let interceptor: RequestInterceptor
let server: ServerAPI

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

beforeEach(async () => {
  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    if (
      [server.getHttpAddress(), server.getHttpsAddress()].includes(req.url.href)
    ) {
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }
  })
})

afterEach(async () => {
  interceptor.restore()
})

afterAll(async () => {
  await server.close()
})

test('responds to an HTTP request that is handled in the middleware', async () => {
  const res = await fetch(server.makeHttpUrl('/'))
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await fetch(server.makeHttpUrl('/get'))
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('responds to an HTTPS request that is handled in the middleware', async () => {
  const res = await fetch(server.makeHttpsUrl('/'), { agent: httpsAgent })
  const body = await res.json()

  expect(res.status).toEqual(201)
  expect(res.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await fetch(server.makeHttpsUrl('/get'), { agent: httpsAgent })
  const body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const httpRes = await fetch(server.makeHttpUrl('/'))
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(200)
  expect(httpBody).toEqual({ route: '/' })

  const httpsRes = await fetch(server.makeHttpsUrl('/'), { agent: httpsAgent })
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(200)
  expect(httpsBody).toEqual({ route: '/' })
})

test('does not throw an error if there are multiple interceptors', async () => {
  const secondInterceptor = new RequestInterceptor(withDefaultInterceptors)
  let res = await fetch(server.makeHttpsUrl('/get'), { agent: httpsAgent })
  let body = await res.json()

  expect(res.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })

  secondInterceptor.restore()
})
