/**
 * @vitest-environment node
 */
import { Readable } from 'node:stream'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text({ type: '*/*' }), (req, res) => {
    res.send(req.body)
  })
})

const interceptedRequestBody = vi.fn()

const interceptor = new ClientRequestInterceptor()
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

  const { text } = await waitForClientRequest(req)
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

it('supports Readable as the request body', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const input = ['hello', ' ', 'world', null]
  const readable = new Readable({
    read: async function () {
      await sleep(10)
      this.push(input.shift())
    },
  })

  readable.pipe(request)

  await waitForClientRequest(request)
  expect(interceptedRequestBody).toHaveBeenCalledWith('hello world')
})

it('calls the write callback when writing an empty string', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write('', writeCallback)
  request.end()
  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledTimes(1)
})

it('calls the write callback when writing an empty Buffer', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write(Buffer.from(''), writeCallback)
  request.end()

  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledTimes(1)
})

it('emits "finish" for a passthrough request', async () => {
  const prefinishListener = vi.fn()
  const finishListener = vi.fn()
  const request = http.request(httpServer.http.url('/resource'))
  request.on('prefinish', prefinishListener)
  request.on('finish', finishListener)
  request.end()

  await waitForClientRequest(request)

  expect(prefinishListener).toHaveBeenCalledTimes(1)
  expect(finishListener).toHaveBeenCalledTimes(1)
})

it('emits "finish" for a mocked request', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response())
  })

  const prefinishListener = vi.fn()
  const finishListener = vi.fn()
  const request = http.request(httpServer.http.url('/resource'))
  request.on('prefinish', prefinishListener)
  request.on('finish', finishListener)
  request.end()

  await waitForClientRequest(request)

  expect(prefinishListener).toHaveBeenCalledTimes(1)
  expect(finishListener).toHaveBeenCalledTimes(1)
})

it('calls all write callbacks before the mocked response', async () => {
  const requestBodyCallback = vi.fn()
  interceptor.once('request', async ({ request, controller }) => {
    requestBodyCallback(await request.text())
    controller.respondWith(new Response('hello world'))
  })

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })
  request.write('one', () => {
    request.end()
  })

  const { text } = await waitForClientRequest(request)

  expect(requestBodyCallback).toHaveBeenCalledWith('one')
  expect(await text()).toBe('hello world')
})

it('calls the write callbacks when reading request body in the interceptor', async () => {
  const requestBodyCallback = vi.fn()
  const requestWriteCallback = vi.fn()

  interceptor.once('request', async ({ request }) => {
    requestBodyCallback(await request.text())
  })

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
  })
  request.write('one', requestWriteCallback)
  request.write('two', requestWriteCallback)
  request.end('three', requestWriteCallback)

  const { text } = await waitForClientRequest(request)

  // Must call each write callback once.
  expect(requestWriteCallback).toHaveBeenCalledTimes(3)
  // Must be able to read the request stream in the interceptor.
  expect(requestBodyCallback).toHaveBeenCalledWith('onetwothree')
  // Must send the correct request body to the server.
  expect(await text()).toBe('onetwothree')
})

/**
 * @see https://github.com/mswjs/interceptors/issues/684
 */
it('calls the write callback once for a request that ends inside a write', async () => {
  const requestWriteCallback = vi.fn()

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
  })
  request.write('one', 'utf8', () => {
    requestWriteCallback()
    request.end()
  })

  await waitForClientRequest(request)
  expect(requestWriteCallback).toHaveBeenCalledTimes(1)
})
