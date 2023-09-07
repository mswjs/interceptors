import { test, expect } from '../../../playwright.extend'

test('treats "Response.error()" as request error', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./xhr-response-error.browser.runtime.js'))

  const requestAfterError = await page.evaluate(() => {
    const request = new XMLHttpRequest()
    request.open('GET', 'http://localhost/resource')

    return new Promise<{
      status: number
      statusText: string
      response: unknown
    }>((resolve) => {
      request.addEventListener('error', () => {
        resolve({
          status: request.status,
          statusText: request.statusText,
          response: request.response,
        })
      })

      request.send()
    })
  })

  expect(requestAfterError.status).toBe(0)
  expect(requestAfterError.statusText).toBe('')
  expect(requestAfterError.response).toBe('')
})
