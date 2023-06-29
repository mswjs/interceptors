import { test, expect } from '../../playwright.extend'

test('treats middleware exceptions as TypeError: Failed to fetch', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./fetch-exception.runtime.js'))

  const fetchRejectionError = await page.evaluate(() => {
    return fetch('http://localhost:3001/resource').catch(
      (error: TypeError & { cause: Error }) => {
        // Serialize the error to retrieve it in the test.
        return {
          name: error.name,
          message: error.message,
          cause: {
            name: error.cause.name,
            message: error.cause.message,
          },
        }
      }
    )
  })

  expect(fetchRejectionError).toEqual({
    name: 'TypeError',
    message: 'Failed to fetch',
    cause: {
      name: 'Error',
      message: 'Network error',
    },
  })
})
