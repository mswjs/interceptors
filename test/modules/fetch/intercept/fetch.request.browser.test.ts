/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { extractRequestFromPage } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  app.post('/user', (_req, res) => {
    res.status(200).send('mocked')
  })
})

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  httpServer.close()
})

test('intercepts fetch requests constructed via a "Request" instance', async () => {
  const context = await pageWith({
    example: path.resolve(__dirname, 'fetch.browser.runtime.js'),
  })
  const url = httpServer.http.url('/user')

  const [request] = await Promise.all([
    extractRequestFromPage(context.page),
    context.page.evaluate((url) => {
      const request = new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-Origin': 'interceptors',
        },
        body: 'hello world',
      })

      return fetch(request)
    }, url),
  ])

  expect(request).toMatchObject({
    id: anyUuid(),
    url: new URL(url),
    method: 'POST',
    headers: headersContaining({
      'content-type': 'text/plain',
      'x-origin': 'interceptors',
    }),
    _body: encodeBuffer('hello world'),
    credentials: 'same-origin',
  })
})
