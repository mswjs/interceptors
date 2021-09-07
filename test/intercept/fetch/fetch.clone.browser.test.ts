import * as path from 'path'
import { pageWith } from 'page-with'
import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestOptions } from 'https'

declare namespace window {
  export const fetchData: (
    url: RequestInfo,
    expectedBody: string
  ) => Promise<void>
}

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (req, res) => {
      res.send('hello world')
    })
  })
})

afterAll(async () => {
  await httpServer.close()
})

it('does not lock the original response', async () => {
  const runtime = await pageWith({
    example: path.resolve(__dirname, 'fetch.clone.runtime.js'),
  })

  await runtime.page.evaluate((url) => {
    return window.fetchData(url, 'hello world')
  }, httpServer.http.makeUrl('/'))
})
