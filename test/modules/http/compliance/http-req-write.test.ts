/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

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

it('calls the callback when writing an empty string', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write('', writeCallback)
  request.end()
  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledTimes(1)
})

it('calls the callback when writing an empty Buffer', async () => {
  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = vi.fn()
  request.write(Buffer.from(''), writeCallback)
  request.end()

  await waitForClientRequest(request)

  expect(writeCallback).toHaveBeenCalledTimes(1)
})
