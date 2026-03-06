// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a handled request issued by "http.get"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const request = http.get('http://any.localhost/non-existing')
  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.statusText).toBe('OK')
  expect
    .soft(response.headers.get('content-type'))
    .toBe('text/plain;charset=UTF-8')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.get"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const request = https.get('https://any.localhost/non-existing')
  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  expect.soft(response.statusText).toBe('OK')
  expect
    .soft(response.headers.get('content-type'))
    .toBe('text/plain;charset=UTF-8')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.get"', async () => {
  const request = http.get(server.http.url('/get'))
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('original-response')
})

it('bypasses an unhandled request issued by "https.get"', async () => {
  const request = https.get(server.https.url('/get'), {
    rejectUnauthorized: false,
  })
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('original-response')
})

it('responds to a handled request issued by "http.request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const request = http.request('http://any.localhost/non-existing')
  request.end()
  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.statusText).toBe('OK')
  expect
    .soft(response.headers.get('content-type'))
    .toBe('text/plain;charset=UTF-8')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const request = https.request('https://any.localhost/non-existing')
  request.end()

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.statusText).toBe('OK')
  expect
    .soft(response.headers.get('content-type'))
    .toBe('text/plain;charset=UTF-8')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.request"', async () => {
  const request = http.request(server.http.url('/get'))
  request.end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('original-response')
})

it('bypasses an unhandled request issued by "https.request"', async () => {
  const request = https.request(server.https.url('/get'), {
    rejectUnauthorized: false,
  })
  request.end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('original-response')
})

it('throws a request error when the middleware throws an exception', async () => {
  const req = http.get('http://error.me')
  await toWebResponse(req).catch((error) => {
    expect(error.message).toEqual('Custom exception message')
  })
})

it('bypasses any request after the interceptor was restored', async () => {
  interceptor.dispose()

  const request = http.get(server.http.url('/'))
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('original-response')
})
