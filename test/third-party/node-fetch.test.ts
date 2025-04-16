// @vitest-environment node
import { it, expect, beforeAll, afterAll } from 'vitest'
import fetch from 'node-fetch'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.status(500).json({ error: 'must use mock' })
  })
  app.get('/get', (req, res) => {
    res.status(200).json({ route: '/get' }).end()
  })
})

const interceptor = new ClientRequestInterceptor()

interceptor.on('request', function testListener({ request, controller }) {
  if ([httpServer.http.url(), httpServer.https.url()].includes(request.url)) {
    controller.respondWith(
      new Response(JSON.stringify({ mocked: true }), {
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
      })
    )
  }
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds to an HTTP request that is handled in the middleware', async () => {
  const response = await fetch(httpServer.http.url('/'))
  const body = await response.json()

  expect(response.status).toEqual(201)
  expect(response.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

it('bypasses an HTTP request not handled in the middleware', async () => {
  const response = await fetch(httpServer.http.url('/get'))
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

it('responds to an HTTPS request that is handled in the middleware', async () => {
  const response = await fetch(httpServer.https.url('/'))
  const body = await response.json()

  expect(response.status).toEqual(201)
  expect(response.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

it('bypasses an HTTPS request not handled in the middleware', async () => {
  const response = await fetch(httpServer.https.url('/get'))
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

it('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()

  const httpRes = await fetch(httpServer.http.url('/'))
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(500)
  expect(httpBody).toEqual({ error: 'must use mock' })

  const httpsRes = await fetch(httpServer.https.url('/'))
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(500)
  expect(httpsBody).toEqual({ error: 'must use mock' })
})

it('does not throw an error if there are multiple interceptors', async () => {
  const secondInterceptor = new ClientRequestInterceptor()
  secondInterceptor.apply()

  const response = await fetch(httpServer.http.url('/get'))
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })

  secondInterceptor.dispose()
})
