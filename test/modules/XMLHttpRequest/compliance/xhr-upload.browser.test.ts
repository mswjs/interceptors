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

  app.post('/upload', fileUpload(), (req, res) => {
    if (req.get('content-type')?.includes('form-data') && !req.files) {
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

test('supports uploading a plain string to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', url)
    xhr.send('hello world')

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/upload'))

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

test('supports uploading a Blob to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', url)
    xhr.send(new Blob(['hello world']))

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/upload'))

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

test('supports uploading URLSearchParams to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', url)
    xhr.send(new URLSearchParams({ hello: 'world' }))

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/upload'))

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

test('supports uploading FormData (single file) to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', url)
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/upload'))

  expect(xhr.status).toBe(200)
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

test('supports uploading FormData (multiple files) to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))

  const { xhr, listeners, callbacks } = await page.evaluate((url) => {
    const data = new FormData()
    data.set('file1', new File(['hello world'], 'hello.txt'))
    data.set('file2', new File(['goodbye cosm'], 'goodbye.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', url)
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  }, httpServer.http.url('/upload'))

  expect(xhr.status).toBe(200)
  expect(listeners).toEqual([
    { type: 'loadstart', loaded: 0, total: 377 },
    { type: 'progress', loaded: 377, total: 377 },
    { type: 'load', loaded: 377, total: 377 },
    { type: 'loadend', loaded: 377, total: 377 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 377 },
    { type: 'progress', loaded: 377, total: 377 },
    { type: 'load', loaded: 377, total: 377 },
    { type: 'loadend', loaded: 377, total: 377 },
  ])
})

/**
 * Mocked scenarios.
 */

test('supports uploading a plain string to a mocked server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', '/upload')
    xhr.send('hello world')

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

test('supports uploading a Blob to a mocked server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', '/upload')
    xhr.send(new Blob(['hello world']))

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

test('supports uploading URLSearchParams to a mocked server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', '/upload')
    xhr.send(new URLSearchParams({ hello: 'world' }))

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

test('supports uploading FormData (single file) to a mocked server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const data = new FormData()
    data.set('data', new File(['hello world'], 'data.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', '/upload')
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  })

  expect(xhr.status).toBe(200)
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

test('supports uploading FormData (multiple files) to a mocked server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-upload.browser.runtime.js'))
  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response())
    })
  })

  const { xhr, listeners, callbacks } = await page.evaluate(() => {
    const data = new FormData()
    data.set('file1', new File(['hello world'], 'hello.txt'))
    data.set('file2', new File(['goodbye cosm'], 'goodbye.txt'))

    const xhr = new XMLHttpRequest()
    const spy = window.spyOnXMLHttpRequest(xhr.upload)
    xhr.open('POST', '/upload')
    xhr.send(data)

    return window.waitForXMLHttpRequest(xhr).then(() => ({ ...spy, xhr }))
  })

  expect(xhr.status).toBe(200)
  expect(listeners).toEqual([
    { type: 'loadstart', loaded: 0, total: 377 },
    { type: 'progress', loaded: 377, total: 377 },
    { type: 'load', loaded: 377, total: 377 },
    { type: 'loadend', loaded: 377, total: 377 },
  ])
  expect(callbacks).toEqual([
    { type: 'loadstart', loaded: 0, total: 377 },
    { type: 'progress', loaded: 377, total: 377 },
    { type: 'load', loaded: 377, total: 377 },
    { type: 'loadend', loaded: 377, total: 377 },
  ])
})
