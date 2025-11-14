// @vitest-environment node
import { SocketInterceptor } from '../../../src/interceptors/net'
import http from 'node:http'
import { beforeAll, afterEach, afterAll, vi, it, expect } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { waitForClientRequest } from '../../helpers'

export const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts an http request without any body', async () => {
  const requestHeader = new DeferredPromise<string>()
  const errorListener = vi.fn()

  interceptor.on('connection', ({ socket }) => {
    socket.on('error', errorListener)
    socket.once('write', (chunk) => requestHeader.resolve(chunk))
    socket.push('HTTP/1.1 200 OK\r\n\r\n')
    socket.push('hello world')
    socket.push(null)
  })

  const request = http.get('http://localhost/resource')
  const { res, text } = await waitForClientRequest(request)

  await expect.soft(requestHeader).resolves.toBe(`GET /resource HTTP/1.1\r
Host: localhost\r
Connection: close\r
\r
`)

  expect.soft(res.statusCode).toBe(200)
  await expect.soft(text()).resolves.toBe('hello world')
  expect.soft(errorListener).not.toHaveBeenCalled()
})

it('intercepts an http request with chunked request body', async () => {
  const requestChunks: Array<string> = []
  const errorListener = vi.fn()

  interceptor.on('connection', ({ socket }) => {
    socket.on('error', errorListener)
    socket.on('write', (chunk) => requestChunks.push(chunk.toString()))
    socket.push('HTTP/1.1 200 OK\r\n\r\n')
    socket.push('hello world')
    socket.push(null)
  })

  const request = http.request('http://localhost/resource', { method: 'POST' })
  request.write('request')
  request.end('body')
  const { res, text } = await waitForClientRequest(request)

  expect.soft(requestChunks.join('\r\n')).toBe(
    `POST /resource HTTP/1.1\r
Host: localhost\r
Connection: close\r
Transfer-Encoding: chunked\r
\r
7\r
\r
\r
request\r
\r
\r
4\r
\r
\r
body\r
\r
\r
0\r
\r
`
  )

  expect.soft(res.statusCode).toBe(200)
  await expect.soft(text()).resolves.toBe('hello world')
  expect.soft(errorListener).not.toHaveBeenCalled()
})
