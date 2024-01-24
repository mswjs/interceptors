import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { waitForClientRequest } from '../../../helpers'
import { SocketInterceptor } from '../../../../src/interceptors/Socket/index'

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text({ type: '*/*' }), (req, res) => {
    res.send(req.body)
  })
})

const interceptedRequestBody = vi.fn()

const interceptor = new SocketInterceptor()
interceptor.on('request', async ({ request }) => {
  interceptedRequestBody(await request.clone().text())
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  vi.restoreAllMocks()
  await httpServer.close()
})

it('writes string request body', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
  })

  req.write('one')
  req.write('two')
  req.end('three')

  const { text } = await waitForClientRequest(req)
  const expectedBody = 'onetwothree'

  expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
  expect(await text()).toEqual(expectedBody)
})

it('writes JSON request body', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  req.write('{"key"')
  req.write(':"value"')
  req.end('}')

  const { res, text } = await waitForClientRequest(req)
  const expectedBody = `{"key":"value"}`

  expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
  expect(await text()).toEqual(expectedBody)
})

it('writes Buffer request body', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  req.write(Buffer.from('{"key"'))
  req.write(Buffer.from(':"value"'))
  req.end(Buffer.from('}'))

  const { text } = await waitForClientRequest(req)
  const expectedBody = `{"key":"value"}`

  expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
  expect(await text()).toEqual(expectedBody)
})

/**
 * @note Node.js does call the write callback when passed an empty string
 * as the written chunk, despite what the docs say.
 * @see https://nodejs.org/api/http.html#requestwritechunk-encoding-callback
 */
it.skip('does not call the write callback when writing an empty string', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  req.write('', writeCallback)
  req.end()
  await waitForClientRequest(req)

  expect(writeCallback).not.toHaveBeenCalled()
})

/**
 * @note Node.js does call the write callback when passed an empty buffer
 * as the written chunk, despite what the docs say.
 * @see https://nodejs.org/api/http.html#requestwritechunk-encoding-callback
 */
it.skip('does not call the write callback when writing an empty Buffer', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  req.write(Buffer.from(''), writeCallback)
  req.end()

  await waitForClientRequest(req)

  expect(writeCallback).not.toHaveBeenCalled()
})
