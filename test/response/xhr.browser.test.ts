/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createBrowserXMLHttpRequest } from '../helpers'
import { InterceptorApi } from '../../src'

declare namespace window {
  export const interceptor: InterceptorApi
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

let server: ServerApi

async function prepareRuntime() {
  const scenario = await pageWith({
    example: path.resolve(__dirname, 'xhr.browser.runtime.js'),
  })

  await scenario.page.evaluate((httpUrl) => {
    window.serverHttpUrl = httpUrl
  }, server.http.makeUrl('/'))

  await scenario.page.evaluate((httpsUrl) => {
    window.serverHttpsUrl = httpsUrl
  }, server.https.makeUrl('/'))

  return scenario
}

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).json({ route: '/' })
    })
    app.get('/get', (req, res) => {
      res.status(200).json({ route: '/get' })
    })
  })
})

afterAll(async () => {
  await server.close()
})

test('responds to an HTTP request handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(scenario)
  const response = await request('GET', server.http.makeUrl('/'))

  expect(response).toHaveProperty('status', 201)
  expect(response).toHaveProperty('statusText', 'Created')
  expect(response).toHaveProperty(
    'headers',
    'content-type: application/hal+json'
  )
  expect(response).toHaveProperty('body', JSON.stringify({ mocked: true }))
})

test('responds to an HTTPS request handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(scenario)
  const response = await request('GET', server.https.makeUrl('/'))

  expect(response).toHaveProperty('status', 201)
  expect(response).toHaveProperty('statusText', 'Created')
  expect(response).toHaveProperty(
    'headers',
    'content-type: application/hal+json'
  )
  expect(response).toHaveProperty('body', JSON.stringify({ mocked: true }))
})

test('bypasses a request not handled in the resolver', async () => {
  const scenario = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(scenario)
  const response = await request('GET', server.http.makeUrl('/get'))

  expect(response).toHaveProperty('status', 200)
  expect(response).toHaveProperty('statusText', 'OK')
  expect(response).toHaveProperty('body', JSON.stringify({ route: '/get' }))
})

test('bypasses any request when the interceptor is restored', async () => {
  const scenario = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(scenario)

  await scenario.page.evaluate(() => {
    window.interceptor.restore()
  })

  const firstResponse = await request('GET', server.http.makeUrl('/'))
  expect(firstResponse).toHaveProperty('status', 200)
  expect(firstResponse).toHaveProperty('statusText', 'OK')
  expect(firstResponse).toHaveProperty('body', JSON.stringify({ route: '/' }))

  const secondResponse = await request('GET', server.http.makeUrl('/get'))
  expect(secondResponse).toHaveProperty('status', 200)
  expect(secondResponse).toHaveProperty('statusText', 'OK')
  expect(secondResponse).toHaveProperty(
    'body',
    JSON.stringify({ route: '/get' })
  )
})
