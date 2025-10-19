// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/pull/722
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import path from 'node:path'
import http from 'node:http'
import { promisify } from 'node:util'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

// const HTTP_SOCKET_PATH = mockFs.resolve('./test.sock')
const HTTP_SOCKET_PATH = path.join(__dirname, './test-http.sock')

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, req.headers)

  if (req.method === 'POST') {
    req.pipe(res)
  } else {
    res.end()
  }
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    httpServer.listen(HTTP_SOCKET_PATH, resolve)
  })

  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await promisify(httpServer.close.bind(httpServer))()
})

it('supports passthrough HTTP GET requests over a unix socket', async () => {
  const request = http.get({
    socketPath: HTTP_SOCKET_PATH,
    path: '/irrelevant',
    headers: {
      'X-Custom-Header': 'custom-value',
    },
  })
  const { res } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers['x-custom-header']).toBe('custom-value')
})

it('supports passthrough HTTP POST requests over a unix socket', async () => {
  const request = http.request({
    method: 'POST',
    socketPath: HTTP_SOCKET_PATH,
    path: '/irrelevant',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': 11,
    },
  })
  request.end('hello world')

  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers).toMatchObject({
    'content-type': 'application/json',
    'content-length': '11',
  })
  await expect.soft(text()).resolves.toBe('hello world')
})

it('supports passthrough HTTP GET requests to a non-existing unix socket', async () => {
  const request = http.get({
    socketPath: path.join('non-existing.sock'),
    path: '/irrelevant',
  })

  await expect(waitForClientRequest(request)).rejects.toThrow(
    expect.objectContaining({
      code: 'ENOENT',
      message: 'connect ENOENT non-existing.sock',
    })
  )
})

it('mocks a response to HTTP GET requests over a unix socket', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response('hello world', request))
  })

  const request = http.get({
    socketPath: HTTP_SOCKET_PATH,
    path: '/irrelevant',
    headers: {
      'X-Custom-Header': 'custom-value',
    },
  })
  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers['x-custom-header']).toBe('custom-value')
  await expect.soft(text()).resolves.toBe('hello world')
})

it('mocks a response to HTTP POST requests over a unix socket', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(
      new Response(request.body, {
        headers: request.headers,
      })
    )
  })

  const request = http.request({
    method: 'POST',
    socketPath: HTTP_SOCKET_PATH,
    path: '/irrelevant',
    headers: {
      'X-Custom-Header': 'custom-value',
    },
  })
  request.end('request-payload')

  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers['x-custom-header']).toBe('custom-value')
  await expect.soft(text()).resolves.toBe('request-payload')
})
