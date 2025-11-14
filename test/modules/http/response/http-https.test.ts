import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { sleep, waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.send('/')
  })
  app.get('/get', (_req, res) => {
    res.send('/get')
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
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds to a handled request issued by "http.get"', async () => {
  const request = http.get('http://any.thing/non-existing')
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  await expect(text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.get"', async () => {
  const request = https.get('https://any.thing/non-existing')
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  await expect(text()).resolves.toEqual('mocked')
})

it.only('bypasses an unhandled request issued by "http.get"', async () => {
  const request = http.get(httpServer.http.url('/get'))
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  await expect(text()).resolves.toEqual('/get')
})

it.only('bypasses an unhandled request issued by "https.get"', async () => {
  const request = https.get(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  await expect(text()).resolves.toEqual('/get')
})

it('responds to a handled request issued by "http.request"', async () => {
  const request = http.request('http://any.thing/non-existing')
  request.end()
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'text/plain')
  await expect(text()).resolves.toEqual('mocked')
})

it('responds to a handled request issued by "https.request"', async () => {
  const socketErrorListener = vi.fn()
  const requestErrorListener = vi.fn()

  const request = https
    .request('https://any.thing/non-existing', {
      timeout: 1000,
    })
    .once('socket', (socket) => {
      socket.on('error', socketErrorListener)
    })
    .on('error', requestErrorListener)

  request.end()

  /**
   * @fixme Error: This is caused by either a bug in Node.js or incorrect usage of Node.js internals.
   * at new NodeError (node:internal/errors:405:5)
    at assert (node:internal/assert:14:11)
    at MockTlsSocket.socketOnData (node:_http_client:539:3)
    at MockTlsSocket.emit (node:events:517:28)
   * @see https://github.com/nodejs/node/blob/a73b575304722a3682fbec3a5fb13b39c5791342/lib/_http_client.js#L612
   */

  const { res, text } = await waitForClientRequest(request)

  expect.soft(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 301,
    statusMessage: 'Moved Permanently',
    headers: {
      'content-type': 'text/plain',
    },
  })
  await expect.soft(text()).resolves.toEqual('mocked')
  expect.soft(socketErrorListener).not.toHaveBeenCalled()
  expect.soft(requestErrorListener).not.toHaveBeenCalled()
})

it('bypasses an unhandled request issued by "http.request"', async () => {
  const request = http.request(httpServer.http.url('/get'))
  request.end()
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  await expect(text()).resolves.toEqual('/get')
})

it('bypasses an unhandled request issued by "https.request"', async () => {
  const request = https.request(httpServer.https.url('/get'), {
    rejectUnauthorized: false,
  })
  request.end()
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  await expect(text()).resolves.toEqual('/get')
})

it('throws a request error when the middleware throws an exception', async () => {
  const request = http.get('http://error.me')
  await waitForClientRequest(request).catch((error) => {
    expect(error.message).toEqual('Custom exception message')
  })
})

it('bypasses any request after the interceptor was restored', async () => {
  interceptor.dispose()

  const request = http.get(httpServer.http.url('/'))
  const { res, text } = await waitForClientRequest(request)

  expect(res).toMatchObject<Partial<http.IncomingMessage>>({
    statusCode: 200,
    statusMessage: 'OK',
  })
  await expect(text()).resolves.toEqual('/')
})
