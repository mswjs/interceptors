import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from '../../helpers'
import { test, expect } from '../../playwright.extend'

const server = new HttpServer((app) => {
  app.use(useCors)
  app.get('/user', (req, res) => {
    res.set('X-Appended-Header', req.headers['x-appended-header']).end()
  })
})

test.beforeAll(async () => {
  await server.listen()
})

test.afterAll(async () => {
  await server.close()
})

test('supports modifying outgoing request headers', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch-modify-request.runtime.js'))

  page.evaluate((url) => fetch(url), server.http.url('/user'))
  const response = await page.waitForResponse(server.http.url('/user'))
  const headers = await response.allHeaders()

  expect(response.status()).toBe(200)
  expect(headers).toHaveProperty('x-appended-header', 'modified')
})
