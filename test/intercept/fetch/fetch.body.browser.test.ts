import * as path from 'path'
import { pageWith } from 'page-with'

type RequestFunction = () => Promise<Response>

declare namespace window {
  export const requestWithEmptyBody: RequestFunction
  export const requestWithBlob: RequestFunction
  export const requestWithFormData: RequestFunction
  export const requestWithArrayBuffer: RequestFunction
  export const requestWithURLSearchParams: RequestFunction
}

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'fetch.body.runtime.js'),
  })
}

test('handles requests with no body', async () => {
  const context = await prepareRuntime()
  await context.page.evaluate(() => window.requestWithEmptyBody())
})

test('handles requests with a Blob body', async () => {
  const context = await prepareRuntime()
  await context.page.evaluate(() => window.requestWithBlob())
})

test('handles requests with a FormData body', async () => {
  const context = await prepareRuntime()
  await context.page.evaluate(() => window.requestWithFormData())
})

test('handles requests with a ArrayBuffer body', async () => {
  const context = await prepareRuntime()
  await context.page.evaluate(() => window.requestWithArrayBuffer())
})

test('handles requests with a URLSearchParams body', async () => {
  const context = await prepareRuntime()
  await context.page.evaluate(() => window.requestWithURLSearchParams())
})
