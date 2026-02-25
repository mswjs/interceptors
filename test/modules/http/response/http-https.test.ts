// @vitest-environment node
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
})

const interceptor = new HttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (url.pathname === '/non-existing') {
    controller.respondWith(
      new Response('mocked', {
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    )
  }

  if (url.href === 'http://error.me/') {
    throw new Error('Custom exception message')
  }
})

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds to a handled request issued by "http.get"', async () => {
  const req = http.get('http://any.localhost/non-existing')
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(301)
  expect(response.statusText).toBe('Moved Permanently')
  expect(response.headers.get('content-type')).toBe('text/plain')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.get"', async () => {
  const req = https.get('https://any.localhost/non-existing')
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(301)
  expect(response.statusText).toBe('Moved Permanently')
  expect(response.headers.get('content-type')).toBe('text/plain')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.get"', async () => {
  const req = http.get(httpServer.http.url('/get'))
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toEqual('/get')
})

it('bypasses an unhandled request issued by "https.get"', async () => {
  const req = https.get(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toEqual('/get')
})

it('responds to a handled request issued by "http.request"', async () => {
  const req = http.request('http://any.localhost/non-existing')
  req.end()
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(301)
  expect(response.statusText).toEqual('Moved Permanently')
  expect(response.headers.get('content-type')).toBe('text/plain')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.request"', async () => {
  const req = https.request('https://any.localhost/non-existing')

  req.end()
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(301)
  expect(response.statusText).toBe('Moved Permanently')
  expect(response.headers.get('content-type')).toBe('text/plain')
  await expect(response.text()).resolves.toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.request"', async () => {
  const req = http.request(httpServer.http.url('/get'))
  req.end()
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toEqual('/get')
})

it('bypasses an unhandled request issued by "https.request"', async () => {
  const req = https.request(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  req.end()
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toEqual('/get')
})

it('throws a request error when the middleware throws an exception', async () => {
  const req = http.get('http://error.me')
  await toWebResponse(req).catch((error) => {
    expect(error.message).toEqual('Custom exception message')
  })
})

it('bypasses any request after the interceptor was restored', async () => {
  interceptor.dispose()

  const req = http.get(httpServer.http.url('/'))
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toEqual('/')
})
