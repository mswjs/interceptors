import { HttpServer } from '@open-draft/test-server/http'
import { Page } from '@playwright/test'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

declare namespace window {
  export const interceptor: FetchInterceptor
  export let serializeHeaders: (headers: Headers) => Record<string, string>
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

interface SerializedResponse {
  url: Response['url']
  type: Response['type']
  status: Response['status']
  statusText: Response['statusText']
  headers: [string, string][]
  json?: Record<string, any>
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.status(200).json({ route: '/' }).end()
  })
  app.get('/get', (req, res) => {
    res.status(200).json({ route: '/get' }).end()
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
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))
  await forwardServerUrls(page)

  const response: SerializedResponse = await page.evaluate((url) => {
    return fetch(url).then((response) => {
      return response.json().then((json) => ({
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
        json,
      }))
    })
  }, httpServer.http.url('/'))
  const headers = new Headers(response.headers)

  expect(response.url).toBe(httpServer.http.url('/'))
  expect(response.type).toBe('default')
  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(headers.get('content-type')).toBe('application/hal+json')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
  expect(response.json).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTP request not handled in the resolver', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))
  await forwardServerUrls(page)

  const response: SerializedResponse = await page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      }
    })
  }, httpServer.http.url('/get'))
  const headers = new Headers(response.headers)

  expect(response.url).toBe(httpServer.http.url('/get'))
  expect(response.type).toBe('cors')
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
})

test('responds to an HTTPS request handled in the resolver', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))
  await forwardServerUrls(page)

  const response: SerializedResponse = await page.evaluate((url) => {
    /**
     * @todo give a custom Agent to allow HTTPS on insecure hosts.
     */
    return fetch(url).then((response) => {
      return response.json().then((json) => ({
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
        json,
      }))
    })
  }, httpServer.https.url('/'))
  const headers = new Headers(response.headers)

  expect(response.url).toBe(httpServer.https.url('/'))
  expect(response.type).toBe('default')
  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(headers.get('content-type')).toBe('application/hal+json')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
  expect(response.json).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTPS request not handled in the resolver', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))
  await forwardServerUrls(page)

  const response: SerializedResponse = await page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      }
    })
  }, httpServer.https.url('/get'))
  const headers = new Headers(response.headers)

  expect(response.url).toBe(httpServer.https.url('/get'))
  expect(response.type).toBe('cors')
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
})

test('bypasses any request when the interceptor is restored', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))
  await forwardServerUrls(page)

  await page.evaluate(() => {
    window.interceptor.dispose()
  })

  const httpResponse: SerializedResponse = await page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      }
    })
  }, httpServer.http.url('/'))

  expect(httpResponse.url).toBe(httpServer.http.url('/'))
  expect(httpResponse.type).toBe('cors')
  expect(httpResponse.status).toBe(200)

  const httpsResponse: SerializedResponse = await page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      }
    })
  }, httpServer.https.url('/get'))

  expect(httpsResponse.url).toBe(httpServer.https.url('/get'))
  expect(httpsResponse.type).toBe('cors')
  expect(httpsResponse.status).toBe(200)
})
