/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { createServer, ServerApi } from '@open-draft/test-server'
import {
  createBrowserXMLHttpRequest,
  createRawBrowserXMLHttpRequest,
} from '../../../helpers'
import { InterceptorApi } from '../../../../src'

declare namespace window {
  export const interceptor: InterceptorApi
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

let httpServer: ServerApi

async function prepareRuntime() {
  const scenario = await pageWith({
    example: path.resolve(__dirname, 'xhr.browser.runtime.js'),
  })

  await scenario.page.evaluate((httpUrl) => {
    window.serverHttpUrl = httpUrl
  }, httpServer.http.makeUrl('/'))

  await scenario.page.evaluate((httpsUrl) => {
    window.serverHttpsUrl = httpsUrl
  }, httpServer.https.makeUrl('/'))

  return scenario
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).json({ route: '/' })
    })
    app.get('/get', (req, res) => {
      res.status(200).json({ route: '/get' })
    })
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('responds to an HTTP request handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(scenario)
  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.makeUrl('/'),
  })

  expect(response.status).toEqual(201)
  expect(response.statusText).toEqual('Created')
  expect(response.headers).toEqual('content-type: application/hal+json')
  expect(response.body).toEqual(JSON.stringify({ mocked: true }))
})

test('responds to an HTTPS request handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(scenario)
  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.https.makeUrl('/'),
  })

  expect(response.status).toEqual(201)
  expect(response.statusText).toEqual('Created')
  expect(response.headers).toEqual('content-type: application/hal+json')
  expect(response.body).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses a request not handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(scenario)
  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.makeUrl('/get'),
  })

  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.body).toEqual(JSON.stringify({ route: '/get' }))
})

test('bypasses any request when the interceptor is restored', async () => {
  const scenario = await prepareRuntime()
  // Uusing the "createRawBrowserXMLHttpRequest" because when the interceptor
  // is restored, it won't dispatch the "resolver" event.
  const callXMLHttpRequest = createRawBrowserXMLHttpRequest(scenario)

  await scenario.page.evaluate(() => {
    window.interceptor.restore()
  })

  const firstResponse = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.makeUrl('/'),
  })

  expect(firstResponse.status).toEqual(200)
  expect(firstResponse.statusText).toEqual('OK')
  expect(firstResponse.body).toEqual(JSON.stringify({ route: '/' }))

  const secondResponse = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.makeUrl('/get'),
  })
  expect(secondResponse.status).toEqual(200)
  expect(secondResponse.statusText).toEqual('OK')
  expect(secondResponse.body).toEqual(JSON.stringify({ route: '/get' }))
})
