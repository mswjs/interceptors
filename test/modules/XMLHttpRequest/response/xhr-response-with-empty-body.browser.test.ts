import { Page } from '@playwright/test'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { test, expect } from '../../../playwright.extend'
import { useCors } from '../../../helpers'

declare namespace window {
  export const interceptor: XMLHttpRequestInterceptor
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.status(200).json({ route: '/' })
  })
  app.get('/get-204', (req, res) => {
    res.status(204).send()
  })
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('204 http status', async ({
  loadExample,
  callRawXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./xhr.browser.runtime.js'))

  const secondResponse = await callRawXMLHttpRequest({
    method: 'GET',
    url: httpServer.http.url('/get-204'),
  })

  expect(secondResponse.status).toBe(204)
  expect(secondResponse.statusText).toBe('No Content')
  expect(secondResponse.body).toEqual('')
})
