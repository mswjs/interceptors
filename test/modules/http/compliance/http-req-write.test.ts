// @vitest-environment node
import { Readable } from 'node:stream'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { sleep, waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text({ type: '*/*' }), (req, res) => {
    res.send(req.body)
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('writes string request body', async () => {
  const requestBodyPromise = new DeferredPromise<string>()

  interceptor.on('request', async ({ request }) => {
    requestBodyPromise.resolve(await request.clone().text())
  })

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

  await expect(requestBodyPromise).resolves.toBe('onetwothree')
  await expect(text()).resolves.toEqual('onetwothree')
})

it('writes JSON request body', async () => {
  const requestBodyPromise = new DeferredPromise<string>()

  interceptor.on('request', async ({ request }) => {
    requestBodyPromise.resolve(await request.clone().text())
  })

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

  await expect(requestBodyPromise).resolves.toBe(`{"key":"value"}`)
  await expect(text()).resolves.toEqual(`{"key":"value"}`)
})

it('writes Buffer request body', async () => {
  const requestBodyPromise = new DeferredPromise<string>()

  interceptor.on('request', async ({ request }) => {
    requestBodyPromise.resolve(await request.clone().text())
  })

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

  await expect(requestBodyPromise).resolves.toBe(`{"key":"value"}`)
  await expect(text()).resolves.toEqual(`{"key":"value"}`)
})

it('supports Readable as the request body', async () => {
  const requestBodyPromise = new DeferredPromise<string>()

  interceptor.on('request', async ({ request }) => {
    requestBodyPromise.resolve(await request.clone().text())
  })

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
  await expect(requestBodyPromise).resolves.toBe('hello world')
})

it('calls the write callback when writing an empty string', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write('', writeCallback)
  request.end()
  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledOnce()
})

it('calls the write callback when writing an empty Buffer', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write(Buffer.from(''), writeCallback)
  request.end()

  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledOnce()
})

it('emits "finish" for a passthrough request', async () => {
  const prefinishListener = vi.fn()
  const finishListener = vi.fn()

  const request = http.request(httpServer.http.url('/resource'))

  request.on('prefinish', prefinishListener)
  request.on('finish', finishListener)
  request.end()

  await waitForClientRequest(request)

  expect(prefinishListener).toHaveBeenCalledOnce()
  expect(finishListener).toHaveBeenCalledOnce()
})

it('emits "finish" for a mocked request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response())
  })

  const prefinishListener = vi.fn()
  const finishListener = vi.fn()

  const request = http.request(httpServer.http.url('/resource'))

  request.on('prefinish', prefinishListener)
  request.on('finish', finishListener)
  request.end()

  await waitForClientRequest(request)

  expect(prefinishListener).toHaveBeenCalledOnce()
  expect(finishListener).toHaveBeenCalledOnce()
})

it('supports ending a mocked request in a write callback', async () => {
  const requestBodyPromise = new DeferredPromise<string>()

  interceptor.on('request', async ({ request, controller }) => {
    requestBodyPromise.resolve(await request.text())
    controller.respondWith(new Response('hello world'))
  })

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const firstWriteCallback = vi.fn()
  const secondWriteCallback = vi.fn()
  const requestEndCallback = vi.fn()

  request.write('one', () => {
    firstWriteCallback()

    request.write('two', () => {
      secondWriteCallback()

      request.end(requestEndCallback)
    })
  })

  const { text } = await waitForClientRequest(request)

  expect(firstWriteCallback).toHaveBeenCalledBefore(secondWriteCallback)
  expect(secondWriteCallback).toHaveBeenCalledBefore(requestEndCallback)
  expect(requestEndCallback).toHaveBeenCalledOnce()

  await expect(requestBodyPromise).resolves.toBe('onetwo')
  await expect(text()).resolves.toBe('hello world')
})

/**
 * @see https://github.com/mswjs/interceptors/issues/684
 */
it('supports ending a bypassed request in a write callback', async () => {
  const requestWriteCallback = vi.fn()

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
  })

  const firstWriteCallback = vi.fn()
  const secondWriteCallback = vi.fn()
  const requestEndCallback = vi.fn()

  request.write('hello', () => {
    firstWriteCallback()

    request.write(' world', () => {
      secondWriteCallback()

      request.end(requestEndCallback)
    })
  })

  const { text } = await waitForClientRequest(request)

  expect(firstWriteCallback).toHaveBeenCalledBefore(secondWriteCallback)
  expect(secondWriteCallback).toHaveBeenCalledBefore(requestEndCallback)
  expect(requestEndCallback).toHaveBeenCalledOnce()

  await expect(text()).resolves.toBe('hello world')
})

it('calls the write callbacks when reading request body in the interceptor', async () => {
  const requestBodyCallback = vi.fn()
  const requestWriteCallback = vi.fn()

  interceptor.on('request', async ({ request }) => {
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
  await expect(text()).resolves.toBe('onetwothree')
})
