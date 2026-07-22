// @vitest-environment node
import fetch from 'node-fetch'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

interceptor.on('request', function testListener({ request, controller }) {
  /**
   * @note The test server always defines a root ("/") route,
   * so this test uses the "/resource" path instead.
   */
  if (
    [
      httpServer.http.url('/resource').href,
      httpServer.https.url('/resource').href,
    ].includes(request.url)
  ) {
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
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/resource', () => {
        return Response.json({ error: 'must use mock' }, { status: 500 })
      })
      router.get('/get', () => {
        return Response.json({ route: '/get' })
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds to an HTTP request that is handled in the middleware', async () => {
  const response = await fetch(httpServer.http.url('/resource').href)
  const body = await response.json()

  expect(response.status).toEqual(201)
  expect(response.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

it('bypasses an HTTP request not handled in the middleware', async () => {
  const response = await fetch(httpServer.http.url('/get').href)
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

it('responds to an HTTPS request that is handled in the middleware', async () => {
  const response = await fetch(httpServer.https.url('/resource').href)
  const body = await response.json()

  expect(response.status).toEqual(201)
  expect(response.headers.get('content-type')).toEqual('application/hal+json')
  expect(body).toEqual({ mocked: true })
})

it('bypasses an HTTPS request not handled in the middleware', async () => {
  const response = await fetch(httpServer.https.url('/get').href)
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })
})

it('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()

  const httpRes = await fetch(httpServer.http.url('/resource').href)
  const httpBody = await httpRes.json()
  expect(httpRes.status).toEqual(500)
  expect(httpBody).toEqual({ error: 'must use mock' })

  const httpsRes = await fetch(httpServer.https.url('/resource').href)
  const httpsBody = await httpsRes.json()
  expect(httpsRes.status).toEqual(500)
  expect(httpsBody).toEqual({ error: 'must use mock' })
})

it('does not throw an error if there are multiple interceptors', async () => {
  const secondInterceptor = new HttpRequestInterceptor()
  secondInterceptor.apply()

  const response = await fetch(httpServer.http.url('/get').href)
  const body = await response.json()

  expect(response.status).toEqual(200)
  expect(body).toEqual({ route: '/get' })

  secondInterceptor.dispose()
})
