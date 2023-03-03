import { test, expect } from '../../playwright.extend'

test('intercepts and mocks a fetch request', async ({ loadExample, page }) => {
  await loadExample(require.resolve('./browser-preset.runtime.js'))

  // Perform a fetch request.
  const response = await page.evaluate(() => {
    return fetch('http://localhost:3001/resource').then(async (response) => {
      return {
        status: response.status,
        statusText: response.statusText,
        text: await response.text(),
      }
    })
  })

  expect(response.status).toBe(200)
  expect(response.text).toBe('mocked')
})

test('intercepts and mocks an XMLHttpRequest', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./browser-preset.runtime.js'))

  const [request, response] = await callXMLHttpRequest({
    method: 'GET',
    url: 'http://localhost:3001/resource',
  })

  expect(request.method).toBe('GET')
  expect(request.url).toBe('http://localhost:3001/resource')

  expect(response.status).toBe(200)
  expect(response.body).toBe('mocked')
})
