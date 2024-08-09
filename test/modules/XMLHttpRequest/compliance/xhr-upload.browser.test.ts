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

async function createFileUpload(
  url: string,
  page: Page
): Promise<{
  listeners: Array<{ type: string; loaded: number; total: number }>
  callbacks: Array<{ type: string; loaded: number; total: number }>
}> {
  return page.evaluate((url) => {
    const listeners = []
    const callbacks = []
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)

    const pushListener = ({ type, loaded, total }) => {
      listeners.push({ type, loaded, total })
    }
    const pushCallback = ({ type, loaded, total }) => {
      callbacks.push({ type, loaded, total })
    }

    xhr.upload.addEventListener('loadstart', pushListener)
    xhr.upload.addEventListener('progress', pushListener)
    xhr.upload.addEventListener('load', pushListener)
    xhr.upload.addEventListener('loadend', pushListener)
    xhr.upload.addEventListener('timeout', pushListener)
    xhr.upload.addEventListener('error', pushListener)

    xhr.upload.onloadstart = pushCallback
    xhr.upload.onprogress = pushCallback
    xhr.upload.onload = pushCallback
    xhr.upload.onloadend = pushCallback
    xhr.upload.ontimeout = pushCallback
    xhr.upload.onerror = pushCallback

    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    return new Promise((resolve, reject) => {
      xhr.addEventListener('loadend', () => {
        resolve({ listeners, callbacks })
      })

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
  const { listeners, callbacks } = await createFileUpload(
    httpServer.http.url('/upload'),
    page
  )

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

  const { listeners, callbacks } = await createFileUpload(
    httpServer.http.url('/upload'),
    page
  )

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
