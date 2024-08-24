import { Page } from '@playwright/test'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

declare namespace window {
  export const interceptor: XMLHttpRequestInterceptor
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.status(200).json({ route: '/' })
  })
  app.get('/get', (req, res) => {
    res.status(200).json({ route: '/get' })
  })
})

async function forwardServerUrls(page: Page): Promise<void> {
  await page.evaluate((httpUrl) => {
    window.serverHttpUrl = httpUrl
  }, httpServer.http.url('/'))

  await page.evaluate((httpsUrl) => {
    window.serverHttpsUrl = httpsUrl
  }, httpServer.https.url('/'))
}

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
  await loadExample(require.resolve('./xhr.browser.runtime.js'))
  await forwardServerUrls(page)

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/'),
  })

  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(response.headers).toBe('content-type: application/hal+json')
  expect(response.body).toEqual(JSON.stringify({ mocked: true }))
})

test('responds to an HTTPS request handled in the resolver', async ({
  loadExample,
  callXMLHttpRequest,
  page,
}) => {
  await loadExample(require.resolve('./xhr.browser.runtime.js'))
  await forwardServerUrls(page)

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.https.url('/'),
  })

  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(response.headers).toBe('content-type: application/hal+json')
  expect(response.body).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses a request not handled in the resolver', async ({
  loadExample,
  callXMLHttpRequest,
  page,
}) => {
  await loadExample(require.resolve('./xhr.browser.runtime.js'))
  await forwardServerUrls(page)

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/get'),
  })

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.body).toEqual(JSON.stringify({ route: '/get' }))
})

test('bypasses any request when the interceptor is restored', async ({
  loadExample,
  callRawXMLHttpRequest,
  page,
}) => {
  await loadExample(require.resolve('./xhr.browser.runtime.js'))
  await forwardServerUrls(page)

  await page.evaluate(() => {
    window.interceptor.dispose()
  })

  // Using the "createRawBrowserXMLHttpRequest" because when the interceptor
  // is restored, it won't dispatch the "resolver" event.
  const firstResponse = await callRawXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/'),
  })

  expect(firstResponse.status).toBe(200)
  expect(firstResponse.statusText).toBe('OK')
  expect(firstResponse.body).toEqual(JSON.stringify({ route: '/' }))

  const secondResponse = await callRawXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/get'),
  })
  expect(secondResponse.status).toBe(200)
  expect(secondResponse.statusText).toBe('OK')
  expect(secondResponse.body).toEqual(JSON.stringify({ route: '/get' }))
})

test('mocks response to a synchronous XMLHttpRequest', async ({
  loadExample,
  callXMLHttpRequest,
  page,
}) => {
  await loadExample(require.resolve('./xhr.browser.runtime.js'))
  await forwardServerUrls(page)

  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/'),
    async: false,
  })

  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(response.headers).toBe('content-type: application/hal+json')
  expect(response.body).toEqual(JSON.stringify({ mocked: true }))
})
