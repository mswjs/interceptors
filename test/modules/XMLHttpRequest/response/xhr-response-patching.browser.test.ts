/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { createBrowserXMLHttpRequest } from '../../../helpers'

declare namespace window {
  export let originalUrl: string
}

const httpServer = new HttpServer((app) => {
  app.get('/original', (req, res) => {
    res
      .set('access-control-expose-headers', 'x-custom-header')
      .set('x-custom-header', 'yes')
      .send('hello')
  })
})

async function prepareRuntime() {
  const runtime = await pageWith({
    example: path.resolve(
      __dirname,
      'xhr-response-patching.browser.runtime.js'
    ),
  })

  await runtime.page.evaluate((url) => {
    window.originalUrl = url
  }, httpServer.http.url('/original'))

  return runtime
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('responds to an HTTP request handled in the resolver', async () => {
  const runtime = await prepareRuntime()
  const callXMLHttpRequest = createBrowserXMLHttpRequest(runtime)

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: 'http://localhost/mocked',
  })

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers).toBe('x-custom-header: yes')
  expect(response.body).toBe('hello world')
})
