/**
 * @jest-environment node
 */
import * as http from 'http'
import * as express from 'express'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { getIncomingMessageBody } from '../../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'
import { NodeClientRequest } from '../../../../src/interceptors/ClientRequest/NodeClientRequest'
import { waitForClientRequest } from '../../../helpers'

let httpServer: ServerApi

const interceptedRequestBody = jest.fn()
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(req) {
    interceptedRequestBody(req.body)
  },
})

function internalRequestBody(req: http.ClientRequest): Buffer {
  return Buffer.concat((req as NodeClientRequest).requestBody)
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/resource', express.text(), (req, res) => {
      res.send(req.body)
    })
  })

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  jest.restoreAllMocks()
  await httpServer.close()
  interceptor.restore()
})

test('writes string request body', (done) => {
  const req = http.request(httpServer.http.makeUrl('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
  })

  req.write('one')
  req.write('two')
  req.end('three')

  req.on('response', async (res) => {
    const expectedBody = 'onetwothree'

    expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
    expect(internalRequestBody(req).toString()).toEqual(expectedBody)
    expect(await getIncomingMessageBody(res)).toEqual(expectedBody)

    done()
  })
})

test('writes JSON request body', (done) => {
  const req = http.request(httpServer.http.makeUrl('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  req.write('{"key"')
  req.write(':"value"')
  req.end('}')

  req.on('response', async (res) => {
    const expectedBody = JSON.stringify({ key: 'value' })

    expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
    expect(internalRequestBody(req).toString()).toEqual(expectedBody)
    expect(await getIncomingMessageBody(res)).toEqual(expectedBody)

    done()
  })
})

test('writes Buffer request body', (done) => {
  const req = http.request(httpServer.http.makeUrl('/resource'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  req.write(Buffer.from('{"key"'))
  req.write(Buffer.from(':"value"'))
  req.end(Buffer.from('}'))

  req.on('response', async (res) => {
    const expectedBody = JSON.stringify({ key: 'value' })

    expect(interceptedRequestBody).toHaveBeenCalledWith(expectedBody)
    expect(internalRequestBody(req).toString()).toEqual(expectedBody)
    expect(await getIncomingMessageBody(res)).toEqual(expectedBody)

    done()
  })
})

test('does not call the write callback when writing an empty string', async () => {
  const req = http.request(httpServer.http.makeUrl('/resource'), {
    method: 'POST',
  })

  const writeCallback = jest.fn()
  req.write('', writeCallback)
  req.end()
  await waitForClientRequest(req)

  expect(writeCallback).not.toHaveBeenCalled()
})

test('does not call the write callback when writing an empty Buffer', async () => {
  const req = http.request(httpServer.http.makeUrl('/resource'), {
    method: 'POST',
  })

  const writeCallback = jest.fn()
  req.write(Buffer.from(''), writeCallback)
  req.end()

  await waitForClientRequest(req)

  expect(writeCallback).not.toHaveBeenCalled()
})
