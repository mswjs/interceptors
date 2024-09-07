import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import https from 'https'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
})

const interceptor = new ClientRequestInterceptor()
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
  const req = http.get('http://any.thing/non-existing')
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  expect(await text()).toEqual('mocked')
})

it('responds to a handled request issued by "https.get"', async () => {
  const req = https.get('https://any.thing/non-existing')
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  expect(await text()).toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.get"', async () => {
  const req = http.get(httpServer.http.url('/get'))
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

it('bypasses an unhandled request issued by "https.get"', async () => {
  const req = https.get(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

it('responds to a handled request issued by "http.request"', async () => {
  const req = http.request('http://any.thing/non-existing')
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'text/plain')
  expect(await text()).toEqual('mocked')
})

it('responds to a handled request issued by "https.request"', async () => {
  const req = https.request('https://any.thing/non-existing')

  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  expect(await text()).toEqual('mocked')
})

it('bypasses an unhandled request issued by "http.request"', async () => {
  const req = http.request(httpServer.http.url('/get'))
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

it('bypasses an unhandled request issued by "https.request"', async () => {
  const req = https.request(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

it('throws a request error when the middleware throws an exception', async () => {
  const req = http.get('http://error.me')
  await waitForClientRequest(req).catch((error) => {
    expect(error.message).toEqual('Custom exception message')
  })
})

it('bypasses any request after the interceptor was restored', async () => {
  interceptor.dispose()

  const req = http.get(httpServer.http.url('/'))
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/')
})
