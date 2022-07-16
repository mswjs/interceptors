/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { RequestHandler } from 'express-serve-static-core'
import { createBrowserXMLHttpRequest } from '../../../helpers'
import { IsomorphicRequest, IsomorphicResponse } from '../../../../src'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  const requestHandler: RequestHandler = (_req, res) => {
    res.status(200).send('user-body')
  }

  app.get('/user', requestHandler)
  app.post('/user', requestHandler)
})

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'XMLHttpRequest.browser.runtime.js'),
  })
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('intercepts an HTTP GET request', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'GET',
    url,
    headers: {
      'x-request-header': 'yes',
    },
  })

  expect(request).toMatchObject({
    id: anyUuid(),
    method: 'GET',
    url: new URL(url),
    headers: headersContaining({
      'x-request-header': 'yes',
    }),
    credentials: 'omit',
    _body: encodeBuffer(''),
  })
  expect(response).toEqual<IsomorphicResponse>({
    status: 200,
    statusText: 'OK',
    headers: headersContaining({}),
    body: 'user-body',
  })
})

test('intercepts an HTTP POST request', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      'x-request-header': 'yes',
    },
    body: JSON.stringify({ user: 'john' }),
  })

  expect(request).toMatchObject({
    id: anyUuid(),
    method: 'POST',
    url: new URL(url),
    headers: headersContaining({}),
    credentials: 'omit',
    _body: encodeBuffer(JSON.stringify({ user: 'john' })),
  })
  expect(response).toEqual<IsomorphicResponse>({
    status: 200,
    statusText: 'OK',
    headers: headersContaining({}),
    body: 'user-body',
  })
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: true,
  })

  expect(request).toMatchObject<Partial<IsomorphicRequest>>({
    credentials: 'include',
  })
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: false,
  })

  expect(request).toMatchObject<Partial<IsomorphicRequest>>({
    credentials: 'omit',
  })
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
  })

  expect(request).toMatchObject<Partial<IsomorphicRequest>>({
    credentials: 'omit',
  })
})
