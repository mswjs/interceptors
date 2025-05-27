// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('awaits response listener promise before resolving the mocked response promise', async () => {
  const markStep = vi.fn<(input: number) => void>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  interceptor.on('response', async ({ response }) => {
    markStep(2)
    await response.text()
    markStep(3)
  })

  markStep(1)
  await fetch('http://localhost/')
  markStep(4)

  expect(markStep).toHaveBeenNthCalledWith(1, 1)
  expect(markStep).toHaveBeenNthCalledWith(2, 2)
  expect(markStep).toHaveBeenNthCalledWith(3, 3)
  expect(markStep).toHaveBeenNthCalledWith(4, 4)
})

it('awaits response listener promise before resolving the original response promise', async () => {
  const markStep = vi.fn<(input: number) => void>()

  interceptor.on('response', async ({ response }) => {
    markStep(2)
    await response.text()
    markStep(3)
  })

  markStep(1)
  await fetch(httpServer.http.url('/resource'))
  markStep(4)

  expect(markStep).toHaveBeenNthCalledWith(1, 1)
  expect(markStep).toHaveBeenNthCalledWith(2, 2)
  expect(markStep).toHaveBeenNthCalledWith(3, 3)
  expect(markStep).toHaveBeenNthCalledWith(4, 4)
})
