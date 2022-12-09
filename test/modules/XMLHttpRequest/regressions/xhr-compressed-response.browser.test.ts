/**
 * @jest-environment node
 * @see https://github.com/mswjs/interceptors/issues/308
 */
import { HttpServer } from '@open-draft/test-server/http'
import { pageWith } from 'page-with'
import zlib from 'zlib'
import { createBrowserXMLHttpRequest, XMLHttpResponse } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'

const httpServer = new HttpServer((app) => {
  app.get('/compressed', (_req, res) => {
    res
      .status(200)
      .set('Content-Encoding', 'gzip')
      .send(zlib.gzipSync(Buffer.from('compressed-body')))
  })
})

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('intercepts a compressed HTTP request', async () => {
  const context = await pageWith({
    example: require.resolve('../intercept/XMLHttpRequest.browser.runtime.js'),
  })

  const pageErrorCallback = jest.fn()
  context.page.on('pageerror', pageErrorCallback).on('console', (message) => {
    if (message.type() === 'error') {
      pageErrorCallback(message.text())
    }
  })

  const callXMLHttpRequest = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.url('/compressed')
  const [, response] = await callXMLHttpRequest({
    method: 'GET',
    url,
  })

  expect(response).toEqual<XMLHttpResponse>({
    status: 200,
    statusText: 'OK',
    headers: headersContaining({}),
    body: 'compressed-body',
  })

  // Playwright prints console errors on the next tick.
  await context.page.waitForTimeout(0)
  expect(pageErrorCallback).not.toHaveBeenCalled()
})
