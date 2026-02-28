// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/pull/722
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { promisify } from 'node:util'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const HTTP_SOCKET_PATH = path.join(__dirname, './test-http.sock')

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, req.headers)

  if (req.method === 'POST') {
    req.pipe(res)
  } else {
    res.end()
  }
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  if (fs.existsSync(HTTP_SOCKET_PATH)) {
    await fs.promises.rm(HTTP_SOCKET_PATH)
  }

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

  if (fs.existsSync(HTTP_SOCKET_PATH)) {
    await fs.promises.rm(HTTP_SOCKET_PATH)
  }
})

it('supports passthrough HTTP GET requests over a unix socket', async () => {
  const request = http.get({
    socketPath: HTTP_SOCKET_PATH,
    path: '/irrelevant',
    headers: {
      'X-Custom-Header': 'custom-value',
    },
  })
  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('x-custom-header')).toBe('custom-value')
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

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(Object.fromEntries(response.headers)).toMatchObject({
    'content-type': 'application/json',
    'content-length': '11',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})

it('supports passthrough HTTP GET requests to a non-existing unix socket', async () => {
  const request = http.get({
    socketPath: path.join('non-existing.sock'),
    path: '/irrelevant',
  })

  await expect(toWebResponse(request)).rejects.toThrow(
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
  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('x-custom-header')).toBe('custom-value')
  await expect.soft(response.text()).resolves.toBe('hello world')
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

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('x-custom-header')).toBe('custom-value')
  await expect.soft(response.text()).resolves.toBe('request-payload')
})
