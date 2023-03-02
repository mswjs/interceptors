import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from '../../../helpers'
import { test, expect } from '../../../playwright.extend'

declare namespace window {
  export let originalUrl: string
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/original', (req, res) => {
    res
      .set('access-control-expose-headers', 'x-custom-header')
      .set('x-custom-header', 'yes')
      .send('hello')
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('responds to an HTTP request handled in the resolver', async ({
  loadExample,
  callXMLHttpRequest,
  page,
}) => {
  await loadExample(
    require.resolve('./xhr-response-patching.browser.runtime.js')
  )
  await page.evaluate((url) => {
    window.originalUrl = url
  }, httpServer.http.url('/original'))

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: 'http://localhost/mocked',
  })

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers).toBe(
    'content-type: text/plain;charset=UTF-8\r\nx-custom-header: yes'
  )
  expect(response.body).toBe('hello world')
})
