import { test, expect } from '../../../playwright.extend'

test('uses the "ws" scheme as-is', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const url = await page.evaluate(() => {
    return new WebSocket('ws://localhost:5678/api').url
  })

  expect(url).toBe('ws://localhost:5678/api')
})

test('uses the "wss" scheme as-is', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const url = await page.evaluate(() => {
    return new WebSocket('wss://localhost:5678/api').url
  })

  expect(url).toBe('wss://localhost:5678/api')
})

test('replaces the "http" scheme with "ws"', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const url = await page.evaluate(() => {
    return new WebSocket('http://localhost:5678/api').url
  })

  expect(url).toBe('ws://localhost:5678/api')
})

test('replaces the "https" scheme with "wss"', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const url = await page.evaluate(() => {
    return new WebSocket('https://localhost:5678/api').url
  })

  expect(url).toBe('wss://localhost:5678/api')
})

test('throws an error on not allowed schemes', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const constructorError = await page.evaluate(() => {
    try {
      new WebSocket('invalid-protocol://localhost').url
    } catch (error) {
      if (error instanceof SyntaxError) {
        return error.message
      }

      throw new Error(`Thrown error is not a SyntaxError`)
    }
  })

  expect(constructorError).toBe(
    `Failed to construct 'WebSocket': The URL's scheme must be either 'http', 'https', 'ws', or 'wss'. 'invalid-protocol:' is not allowed.`
  )
})

test('resolves a relative WebSocket URL against location', async ({
  loadExample,
  page,
}) => {
  const { previewUrl } = await loadExample(
    require.resolve('../websocket.runtime.js')
  )

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const url = await page.evaluate(() => {
    return new WebSocket('/api').url
  })

  expect(url).toBe(`ws://${new URL(previewUrl).host}/api`)
})
