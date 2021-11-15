/**
 * @jest-environment node
 */
import * as path from 'path'
import { ServerApi, createServer } from '@open-draft/test-server'
import { pageWith } from 'page-with'

declare global {
  interface Window {
    events: UploadEventsList[]
    callbacks: UploadEventsList[]
  }
}

type UploadEventsList = [string, { loaded?: number; total?: number }]

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/upload', (_req, res) => {
      console.log('POST /upload OK')
      res.send('ok')
    })
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('emits upload events in the browser', async () => {
  const runtime = await pageWith({
    example: path.resolve(__dirname, 'xhr-upload.browser.runtime.js'),
    env: {
      endpointUrl: httpServer.http.makeUrl('/upload'),
    },
  })

  const eventsPromise = runtime.page.evaluate(() => {
    return new Promise<UploadEventsList[]>((resolve) => {
      window.addEventListener('message', (event) => {
        if (event.data === 'loadend') {
          resolve(window.events)
        }
      })
    })
  })

  await runtime.page.click('body')
  const uploadEvents = await eventsPromise

  expect(uploadEvents).toEqual<UploadEventsList[]>([
    ['loadstart', { loaded: 0, total: 10 }],
    ['progress', { loaded: 10, total: 10 }],
    ['load', { loaded: 10, total: 10 }],
    ['loadend', { loaded: 10, total: 10 }],
  ])
})

test('calls upload callbacks in the browser', async () => {
  const runtime = await pageWith({
    example: path.resolve(__dirname, 'xhr-upload.browser.runtime.js'),
    env: {
      endpointUrl: httpServer.http.makeUrl('/upload'),
    },
  })

  const callbacksPromise = runtime.page.evaluate(() => {
    return new Promise<UploadEventsList[]>((resolve) => {
      window.addEventListener('message', (event) => {
        if (event.data === 'loadend') {
          resolve(window.callbacks)
        }
      })
    })
  })

  await runtime.page.click('body')
  const uploadCallbacks = await callbacksPromise

  expect(uploadCallbacks).toEqual<UploadEventsList[]>([
    ['loadstart', { loaded: 0, total: 10 }],
    ['progress', { loaded: 10, total: 10 }],
    ['load', { loaded: 10, total: 10 }],
    ['loadend', { loaded: 10, total: 10 }],
  ])
})
