// @vitest-environment node
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const HTTP_SOCKET_PATH = path.join(__dirname, './test-early-return.sock')

const httpServer = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    httpServer.listen(HTTP_SOCKET_PATH, resolve)
  })
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await promisify(httpServer.close.bind(httpServer))()
})

/**
 * When no request listeners are registered, the interceptor should call
 * passthrough() immediately without going through the full async machinery.
 * This prevents timing issues with high-concurrency Unix socket requests.
 * @see https://github.com/mswjs/interceptors/issues/760
 */
it('performs passthrough over a Unix socket when no request listeners are attached', async () => {
  const request = http.request({
    socketPath: HTTP_SOCKET_PATH,
    path: '/resource',
  })
  request.end()
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  await expect(text()).resolves.toBe('ok')
})

it('handles concurrent Unix socket requests when no listeners are attached', async () => {
  const requests = Array.from({ length: 20 }, () => {
    const req = http.request({
      socketPath: HTTP_SOCKET_PATH,
      path: '/resource',
    })
    req.end()
    return waitForClientRequest(req)
  })

  const results = await Promise.all(requests)

  for (const { res, text } of results) {
    expect(res.statusCode).toBe(200)
    await expect(text()).resolves.toBe('ok')
  }
})
