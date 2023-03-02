import { HttpServer } from '@open-draft/test-server/http'
import { Page } from '@playwright/test'
import { listToHeaders } from 'headers-polyfill'
import { test, expect } from '../../../playwright.extend'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { useCors } from '../../../helpers'

declare namespace window {
  export const interceptor: FetchInterceptor
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

async function forwardServerUrl(page: Page): Promise<void> {
  await page.evaluate((url) => {
    window.originalUrl = url
  }, httpServer.http.url('/original'))
}

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('supports response patching', async ({ loadExample, page }) => {
  await loadExample(require.resolve('./fetch-response-patching.runtime.js'))
  await forwardServerUrl(page)

  const res = await page.evaluate(() => {
    return fetch('http://localhost/mocked').then((res) => {
      return res.text().then((text) => {
        return {
          status: res.status,
          statusText: res.statusText,
          headers: Array.from(res.headers.entries()),
          text,
        }
      })
    })
  })
  const headers = listToHeaders(res.headers)

  expect(res.status).toBe(200)
  expect(res.statusText).toBe('OK')
  expect(headers.get('x-custom-header')).toBe('yes')
  expect(res.text).toBe('hello world')
})
