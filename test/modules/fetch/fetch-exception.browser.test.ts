import { FetchInterceptor } from '../../../src/interceptors/fetch'
import { test, expect } from '../../playwright.extend'

declare global {
  interface Window {
    interceptor: FetchInterceptor
  }
}

test('treats Response.error() mocked responses as TypeError: Failed to fetch', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch-exception.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.once('request', ({ controller }) => {
      controller.respondWith(Response.error())
    })
  })

  const fetchRejectionError = await page.evaluate(() => {
    return fetch('http://localhost:3000/resource').catch(
      (error: TypeError & { cause: Error }) => {
        return {
          name: error.name,
          message: error.message,
        }
      }
    )
  })

  expect(fetchRejectionError).toEqual({
    name: 'TypeError',
    message: 'Failed to fetch',
  })
})

test('treats unhandled interceptor exceptions as 500 error responses', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch-exception.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.once('request', ({ request }) => {
      throw new Error('Server error')
    })
  })

  const response = await page.evaluate(async () => {
    const response = await fetch('http://localhost:3000/resource')
    return {
      status: response.status,
      statusText: response.statusText,
      json: await response.json(),
    }
  })

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  expect(response.json).toEqual({
    name: 'Error',
    message: 'Server error',
    stack: expect.any(String),
  })
})
