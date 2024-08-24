/**
 * @see https://github.com/mswjs/interceptors/issues/614
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

declare global {
  interface Window {
    interceptor: XMLHttpRequestInterceptor
    spyOnXMLHttpRequest: (xhr: XMLHttpRequest | XMLHttpRequestUpload) => {
      listeners: Array<XMLHttpRequestSpyEntry>
      callbacks: Array<XMLHttpRequestSpyEntry>
    }
    waitForXMLHttpRequest: (xhr: XMLHttpRequest) => Promise<void>
  }
}

type XMLHttpRequestSpyEntry = {
  type: keyof XMLHttpRequestEventMap
  loaded: number
  total: number
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.send(Buffer.from('hello world'))
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('supports response progress for a mocked response', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response(new Blob(['hello world'])))
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr)
    xhr.open('GET', '/does-not-matter')
    xhr.send()

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  })

  expect(xhr.status).toBe(200)
  expect(listeners).toEqual([
    { type: 'loadstart', loaded: 0, total: 11 },
    { type: 'progress', loaded: 11, total: 11 },
    { type: 'load', loaded: 11, total: 11 },
    { type: 'loadend', loaded: 11, total: 11 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 11 },
    { type: 'progress', loaded: 11, total: 11 },
    { type: 'load', loaded: 11, total: 11 },
    { type: 'loadend', loaded: 11, total: 11 },
  ])
})

test('supports response progress for a bypassed response', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr)
    xhr.open('GET', url)
    xhr.send()

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/'))

  expect(xhr.status).toBe(200)
  expect(listeners).toEqual([
    /**
     * @note The browser dispatches "lodastart" with 0/0.
     * Not sure if we should align the mock to do the same.
     * I haven't found any indication that "loadstart" MUST
     * set `total` to 0.
     */
    { type: 'loadstart', loaded: 0, total: 0 },
    { type: 'progress', loaded: 11, total: 11 },
    { type: 'load', loaded: 11, total: 11 },
    { type: 'loadend', loaded: 11, total: 11 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 0 },
    { type: 'progress', loaded: 11, total: 11 },
    { type: 'load', loaded: 11, total: 11 },
    { type: 'loadend', loaded: 11, total: 11 },
  ])
})
