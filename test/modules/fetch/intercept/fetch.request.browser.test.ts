import { HttpServer } from '@open-draft/test-server/http'
import { extractRequestFromPage, useCors } from '../../../helpers'
import { test, expect } from '../../../playwright.extend'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.post('/user', (_req, res) => {
    res.status(200).send('mocked')
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  httpServer.close()
})

test('intercepts fetch requests constructed via a "Request" instance', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch.browser.runtime.js'))

  const url = httpServer.http.url('/user')

  const [request] = await Promise.all([
    extractRequestFromPage(page),
    page.evaluate((url) => {
      const request = new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-Origin': 'interceptors',
        },
        body: 'hello world',
      })

      return fetch(request)
    }, url),
  ])

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('text/plain')
  expect(request.headers.get('x-origin')).toBe('interceptors')
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('hello world')
})
