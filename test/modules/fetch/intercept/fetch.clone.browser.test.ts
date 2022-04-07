import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'

declare namespace window {
  export const fetchData: (url: RequestInfo) => Promise<void>
}

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('hello world')
  })
})

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('does not lock the original response', async () => {
  const runtime = await pageWith({
    example: path.resolve(__dirname, 'fetch.clone.runtime.js'),
  })

  runtime.page.evaluate((url) => {
    return window.fetchData(url)
  }, httpServer.http.url('/'))

  const responseText = await runtime.page.evaluate(() => {
    return new Promise((resolve) => {
      document.addEventListener(
        'response-text' as any,
        (event: CustomEvent<string>) => {
          resolve(event.detail)
        }
      )
    })
  })

  expect(responseText).toEqual('hello world')
})
