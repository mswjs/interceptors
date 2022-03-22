/**
 * @jest-environment node
 */
import * as http from 'http'
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  async resolver(event) {
    const { request } = event

    if (request.url.pathname === '/non-existing') {
      event.respondWith({
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'mocked',
      })

      return
    }

    if (request.url.href === 'http://error.me/') {
      throw new Error('Custom exception message')
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (_req, res) => {
      res.status(200).send('/')
    })
    app.get('/get', (_req, res) => {
      res.status(200).send('/get')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('responds to a handled request issued by "http.get"', async () => {
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

test('responds to a handled request issued by "https.get"', async () => {
  const req = https.get('https://any.thing/non-existing', { agent: httpsAgent })
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

test('bypasses an unhandled request issued by "http.get"', async () => {
  const req = http.get(httpServer.http.makeUrl('/get'))
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

test('bypasses an unhandled request issued by "https.get"', async () => {
  const req = https.get(httpServer.https.makeUrl('/get'), { agent: httpsAgent })
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

test('responds to a handled request issued by "http.request"', async () => {
  const req = http.request('http://any.thing/non-existing')
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'text/plain')
  expect(await text()).toEqual('mocked')
})

test('responds to a handled request issued by "https.request"', async () => {
  const req = https.request('https://any.thing/non-existing', {
    agent: httpsAgent,
  })

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

test('bypasses an unhandled request issued by "http.request"', async () => {
  const req = http.request(httpServer.http.makeUrl('/get'))
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

test('bypasses an unhandled request issued by "https.request"', async () => {
  const req = https.request(httpServer.https.makeUrl('/get'), {
    agent: httpsAgent,
  })
  req.end()
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/get')
})

test('throws a request error when the middleware throws an exception', async () => {
  const req = http.get('http://error.me')
  await waitForClientRequest(req).catch((error) => {
    expect(error.message).toEqual('Custom exception message')
  })
})

test('bypasses any request after the interceptor was restored', async () => {
  interceptor.restore()

  const req = http.get(httpServer.http.makeUrl('/'))
  const { res, text } = await waitForClientRequest(req)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  expect(await text()).toEqual('/')
})
