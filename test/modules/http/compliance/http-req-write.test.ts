/**
 * @jest-environment node
 */
import * as http from 'http'
import * as express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text(), (req, res) => {
    res.send(req.body)
  })
})

const interceptedRequestBody = jest.fn()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  interceptedRequestBody(request.body)
})

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  jest.restoreAllMocks()
  await httpServer.close()
})

test('writes string request body', async () => {
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

test('writes JSON request body', async () => {
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
  const expectedBody = JSON.stringify({ key: 'value' })

  expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
  expect(await text()).toEqual(expectedBody)
})

test('writes Buffer request body', async () => {
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
  const expectedBody = JSON.stringify({ key: 'value' })

  expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
  expect(await text()).toEqual(expectedBody)
})

test('calls write callback once when writing an empty string', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = jest.fn()
  req.write('', writeCallback)
  req.end()
  await waitForClientRequest(req)

  // Despite the Node.js docs, this is how ClientRequest behaves.
  expect(writeCallback).toHaveBeenCalledTimes(1)
})

test('calls write callback once when writing an empty Buffer', async () => {
  const req = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
  })

  const writeCallback = jest.fn()
  req.write(Buffer.from([]), writeCallback)
  req.end()

  await waitForClientRequest(req)

  expect(writeCallback).toHaveBeenCalledTimes(1)
})
