import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

const interceptor = new ClientRequestInterceptor()

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

it('awaits asynchronous response event listener for a mocked response', async () => {
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
  const request = http.get('http://localhost/')
  const { text } = await waitForClientRequest(request)
  markStep(4)

  expect(await text()).toBe('hello world')

  expect(markStep).toHaveBeenNthCalledWith(1, 1)
  expect(markStep).toHaveBeenNthCalledWith(2, 2)
  expect(markStep).toHaveBeenNthCalledWith(3, 3)
  expect(markStep).toHaveBeenNthCalledWith(4, 4)
})

it('awaits asynchronous response event listener for the original response', async () => {
  const markStep = vi.fn<(input: number) => void>()

  interceptor.on('response', async ({ response }) => {
    markStep(2)
    await response.text()
    markStep(3)
  })

  markStep(1)
  const request = http.get(httpServer.http.url('/resource'))
  const { text } = await waitForClientRequest(request)
  markStep(4)

  expect(await text()).toBe('original response')

  expect(markStep).toHaveBeenNthCalledWith(1, 1)
  expect(markStep).toHaveBeenNthCalledWith(2, 2)
  expect(markStep).toHaveBeenNthCalledWith(3, 3)
  expect(markStep).toHaveBeenNthCalledWith(4, 4)
})
