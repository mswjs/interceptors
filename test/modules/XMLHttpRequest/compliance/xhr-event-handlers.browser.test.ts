import { HttpServer } from '@open-draft/test-server/http'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/resource', (req, res) => {
    res.status(200).send('hello')
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('onloadend handler is called when not returning a mocked response', async ({ page, loadExample }) => {
  await loadExample(require.resolve('./xhr-event-handlers.browser.runtime.js'))

  const { request, calls } = await page.evaluate(async (url) => {
    const calls = {
      loadEndHandler: 0,
      loadEndListener: 0,
    }

    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onloadend = () => calls.loadEndHandler++
    xhr.addEventListener('loadend', () => calls.loadEndListener++)
    xhr.send(null)

    await new Promise((resolve) => {
      const resolveDelayed = () => setTimeout(resolve, 1000)
      xhr.addEventListener('error', resolveDelayed)
      xhr.addEventListener('load', resolveDelayed)
    })

    return {
      request: xhr,
      calls,
    }
  }, httpServer.http.url('/resource'))

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(200)
  expect(request.responseText).toBe('hello')

  expect(calls.loadEndHandler).toBe(1)
  expect(calls.loadEndListener).toBe(1)
})
