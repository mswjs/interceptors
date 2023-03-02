/**
 * @see https://github.com/mswjs/interceptors/issues/308
 */
import { HttpServer } from '@open-draft/test-server/http'
import zlib from 'zlib'
import { useCors } from '../../../helpers'
import { test, expect } from '../../../playwright.extend'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/compressed', (_req, res) => {
    res
      .status(200)
      .set('Content-Encoding', 'gzip')
      .send(zlib.gzipSync(Buffer.from('compressed-body')))
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('intercepts a compressed HTTP request', async ({
  loadExample,
  callXMLHttpRequest,
  page,
}) => {
  await loadExample(
    require.resolve('../intercept/XMLHttpRequest.browser.runtime.js')
  )

  const pageErrors: Array<string> = []
  page
    .on('pageerror', (error) => {
      pageErrors.push(error.message)
    })
    .on('console', (message) => {
      if (message.type() === 'error') {
        pageErrors.push(message.text())
      }
    })

  const url = httpServer.http.url('/compressed')
  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url,
  })

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.body).toBe('compressed-body')

  // Playwright prints console errors on the next tick.
  await page.waitForTimeout(0)
  expect(pageErrors).toEqual([])
})
