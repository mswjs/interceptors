import { test, expect } from '../../../playwright.extend'

test('support basic client-server communication', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./ws.runtime.js'))

  await page.pause()

  await expect(page.getByText('[client]: Hi! My name is John.')).toBeVisible()
  await expect(page.getByText('[server]: Greetings, John!')).toBeVisible()
  await expect(page.getByText('[client]: Happy to be here')).toBeVisible()
})
