/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import cors from 'cors'
import { createServer, ServerApi } from '@open-draft/test-server'
import { RequestHandler } from 'express-serve-static-core'
import { createBrowserXMLHttpRequest } from '../../../helpers'

let httpServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'XMLHttpRequest.browser.runtime.js'),
  })
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
    const requestHandler: RequestHandler = (req, res) => {
      res
        // Set the allowed origin (CORS) to enable "withCredentials".
        .set('Access-Control-Allow-Origin', req.header('origin'))
        // Allow accepting the credentials so that "withCredentials"
        // can be set to true.
        .set('Access-Control-Allow-Credentials', 'true')
        .send('user-body')
    }

    app.get('/user', requestHandler)
    app.post('/user', requestHandler)
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('intercepts an HTTP GET request', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'GET',
    url,
    headers: {
      'x-request-header': 'yes',
    },
  })

  expect(request.method).toEqual('GET')
  expect(request.url.href).toEqual(url)
  expect(request.headers.get('x-request-header')).toEqual('yes')
  expect(request.credentials).toEqual('omit')
  expect(request.body).toBeUndefined()

  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.body).toEqual('user-body')
})

test('intercepts an HTTP POST request', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'POST',
    url,
    headers: {
      'x-request-header': 'yes',
    },
    body: JSON.stringify({ user: 'john' }),
  })

  expect(request.method).toEqual('POST')
  expect(request.url.href).toEqual(url)
  expect(request.headers.get('x-request-header')).toEqual('yes')
  expect(request.credentials).toEqual('omit')
  expect(request.body).toEqual(JSON.stringify({ user: 'john' }))

  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.body).toEqual('user-body')
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: true,
  })

  expect(request.credentials).toEqual('include')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: false,
  })

  expect(request.credentials).toEqual('omit')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  const context = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
  })

  expect(request.credentials).toEqual('omit')
})
