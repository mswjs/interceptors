/**
 * @vitest-environment node
 * @see https://github.com/mswjs/msw/issues/2537
 *
 * This test verifies that socket listeners are properly cleaned up
 * after passthrough requests complete, preventing memory leaks.
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.send('hello')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not emit MaxListenersExceededWarning after many passthrough requests', async () => {
  const warnings: Error[] = []

  // Capture any warnings about max listeners
  const warningHandler = (warning: Error) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  // Make many passthrough requests - enough to trigger max listener warning if leaking
  // Default max listeners is 10, so we do more than that
  const requestCount = 15

  for (let i = 0; i < requestCount; i++) {
    await new Promise<void>((resolve, reject) => {
      const req = http.get(httpServer.http.url('/resource'), (res) => {
        res.on('data', () => {})
        res.on('end', resolve)
        res.on('error', reject)
      })
      req.on('error', reject)
    })
  }

  process.off('warning', warningHandler)

  // Should not have any max listeners exceeded warnings
  expect(warnings).toHaveLength(0)
})
