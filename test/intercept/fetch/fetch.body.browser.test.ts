/**
 * @jest-environment node
 */
import * as path from 'path'
import { Page, pageWith } from 'page-with'

type RequestFunction = () => Promise<Response>

declare namespace window {
  export const requestBody: string
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

function getRequestBody(page: Page): Promise<string> {
  return page.evaluate(() => window.requestBody)
}

test('handles requests with no body', async () => {
  const { page } = await prepareRuntime()
  await page.evaluate(() => window.requestWithEmptyBody())
  const requestBody = await getRequestBody(page)

  expect(requestBody).toBe('')
})

test('handles requests with a Blob body', async () => {
  const { page } = await prepareRuntime()
  await page.evaluate(() => window.requestWithBlob())
  const requestBody = await getRequestBody(page)

  expect(requestBody).toBe('blobstring')
})

test('handles requests with a FormData body', async () => {
  const { page } = await prepareRuntime()
  await page.evaluate(() => window.requestWithFormData())
  const requestBody = await getRequestBody(page)

  expect(requestBody).toMatch(
    /------WebKitFormBoundary.+\r\nContent-Disposition: form-data; name="username"\r\n\r\njohn\r\n------WebKitFormBoundary.+\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecret-123\r\n------WebKitFormBoundary.+--\r\n$/gm
  )
})

test('handles requests with a ArrayBuffer body', async () => {
  const { page } = await prepareRuntime()
  await page.evaluate(() => window.requestWithArrayBuffer())
  const requestBody = await getRequestBody(page)

  expect(requestBody).toBe('buffer string')
})

test('handles requests with a URLSearchParams body', async () => {
  const { page } = await prepareRuntime()
  await page.evaluate(() => window.requestWithURLSearchParams())
  const requestBody = await getRequestBody(page)

  expect(requestBody).toBe('username=john&password=secret-123')
})
