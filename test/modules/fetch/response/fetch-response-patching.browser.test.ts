/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { listToHeaders } from 'headers-polyfill'

declare namespace window {
  export const interceptor: FetchInterceptor
  export let originalUrl: string
}

const httpServer = new HttpServer((app) => {
  app.get('/original', (req, res) => {
    res
      .set('access-control-expose-headers', 'x-custom-header')
      .set('x-custom-header', 'yes')
      .send('hello')
  })
})

async function prepareRuntime() {
  const context = await pageWith({
    example: path.resolve(__dirname, 'fetch-response-patching.runtime.js'),
  })

  await context.page.evaluate((url) => {
    window.originalUrl = url
  }, httpServer.http.url('/original'))

  return context
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

it('supports response patching', async () => {
  const runtime = await prepareRuntime()

  const res = await runtime.page.evaluate(() => {
    return fetch('http://localhost/mocked').then((res) => {
      return res.text().then((text) => {
        return {
          status: res.status,
          statusText: res.statusText,
          headers: Array.from(res.headers.entries()),
          text,
        }
      })
    })
  })
  const headers = listToHeaders(res.headers)

  expect(res.status).toBe(200)
  expect(res.statusText).toBe('OK')
  expect(headers.get('x-custom-header')).toBe('yes')
  expect(res.text).toBe('hello world')
})
