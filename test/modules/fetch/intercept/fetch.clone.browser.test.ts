import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from '../../../helpers'
import { test, expect } from '../../../playwright.extend'

declare namespace window {
  export const fetchData: (url: RequestInfo) => Promise<void>
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.send('hello world')
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('does not lock the original response', async ({ loadExample, page }) => {
  await loadExample(require.resolve('./fetch.clone.runtime.js'))

  page.evaluate((url) => {
    return window.fetchData(url)
  }, httpServer.http.url('/'))

  const responseText = await page.evaluate(() => {
    return new Promise((resolve) => {
      document.addEventListener(
        'response-text' as any,
        (event: CustomEvent<string>) => {
          resolve(event.detail)
        }
      )
    })
  })

  expect(responseText).toEqual('hello world')
})
