/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { createServer, ServerApi } from '@open-draft/test-server'
import { IsomorphicRequest } from '../../../../src/glossary'
import { extractRequestFromPage } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/user', (_req, res) => {
      res.status(200).send('mocked')
    })
  })
})

afterAll(async () => {
  httpServer.close()
})

test('intercepts fetch requests constructed via a "Request" instance', async () => {
  const context = await pageWith({
    example: path.resolve(__dirname, 'fetch.browser.runtime.js'),
  })
  const url = httpServer.http.makeUrl('/user')

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

  expect(request).toEqual<IsomorphicRequest>({
    id: anyUuid(),
    url: new URL(url),
    method: 'POST',
    headers: headersContaining({
      'content-type': 'text/plain',
      'x-origin': 'interceptors',
    }),
    body: 'hello world',
    credentials: 'same-origin',
  })
})
