/**
 * @see https://github.com/mswjs/interceptors/issues/573
 */
import type { Page } from '@playwright/test'
import fileUpload from 'express-fileupload'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

declare global {
  interface Window {
    interceptor: XMLHttpRequestInterceptor
  }
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

async function createFileUpload(url: string, page: Page) {
  return page.evaluate((url) => {
    const events = []
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)

    const pushEvent = ({ type, loaded, total }) => {
      events.push({ type, loaded, total })
    }

    xhr.upload.addEventListener('loadstart', pushEvent)
    xhr.upload.addEventListener('progress', pushEvent)
    xhr.upload.addEventListener('load', pushEvent)
    xhr.upload.addEventListener('loadend', pushEvent)
    xhr.upload.addEventListener('timeout', pushEvent)
    xhr.upload.addEventListener('error', pushEvent)

    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    return new Promise((resolve, reject) => {
      xhr.addEventListener('loadend', () => resolve(events))
      xhr.addEventListener('error', () => {
        reject(new Error('File upload errored'))
      })
      xhr.addEventListener('timeout', () => {
        reject(new Error('File upload timed out'))
      })

      xhr.send(data)
    })
  }, url)
}

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('supports uploading a file to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  const events = await createFileUpload(httpServer.http.url('/upload'), page)

  expect(events).toEqual([
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

  const events = await createFileUpload(httpServer.http.url('/upload'), page)

  expect(events).toEqual([
    { type: 'loadstart', loaded: 0, total: 207 },
    { type: 'progress', loaded: 207, total: 207 },
    { type: 'load', loaded: 207, total: 207 },
    { type: 'loadend', loaded: 207, total: 207 },
  ])
})
