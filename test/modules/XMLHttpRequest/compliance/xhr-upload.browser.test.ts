/**
 * @see https://github.com/mswjs/interceptors/issues/573
 */
import fileUpload from 'express-fileupload'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

declare global {
  interface Window {
    interceptor: XMLHttpRequestInterceptor
    spyOnXMLHttpRequest: (xhr: XMLHttpRequest) => {
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

  app.post('/upload', fileUpload(), (req, res) => {
    if (!req.files?.data) {
      return res.status(400).send('Missing file')
    }
    return res.status(200).end()
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test.only('supports uploading a file to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { listeners, callbacks } = await page.evaluate((url) => {
    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr)
    xhr.open('POST', url)
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => spy)
  }, httpServer.http.url('/upload'))

  expect(listeners).toEqual([
    { type: 'loadstart', loaded: 0, total: 207 },
    { type: 'progress', loaded: 207, total: 207 },
    { type: 'load', loaded: 207, total: 207 },
    { type: 'loadend', loaded: 207, total: 207 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 207 },
    { type: 'progress', loaded: 207, total: 207 },
    { type: 'load', loaded: 207, total: 207 },
    { type: 'loadend', loaded: 207, total: 207 },
  ])
})

test('supports uploading a file to a mock', async ({ loadExample, page }) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.on('request', ({ request, controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { listeners, callbacks } = await page.evaluate(() => {
    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr)
    xhr.open('POST', '/upload')
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => spy)
  })

  expect(listeners).toEqual([
    { type: 'loadstart', loaded: 0, total: 207 },
    { type: 'progress', loaded: 207, total: 207 },
    { type: 'load', loaded: 207, total: 207 },
    { type: 'loadend', loaded: 207, total: 207 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 207 },
    { type: 'progress', loaded: 207, total: 207 },
    { type: 'load', loaded: 207, total: 207 },
    { type: 'loadend', loaded: 207, total: 207 },
  ])
})
