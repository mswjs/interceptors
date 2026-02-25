// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

const interceptor = new HttpRequestInterceptor()

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
  const tag = vi.fn<(tag: string) => void>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  interceptor.on('response', async ({ response }) => {
    tag('response')
    await response.text()
    tag('after-response')
  })

  tag('before-request')
  const request = http.get('http://localhost/')
  const [response] = await toWebResponse(request)
  tag('after-request')

  await expect(response.text()).resolves.toBe('hello world')

  expect.soft(tag).toHaveBeenNthCalledWith(1, 'before-request')
  expect.soft(tag).toHaveBeenNthCalledWith(2, 'response')
  expect.soft(tag).toHaveBeenNthCalledWith(3, 'after-response')
  expect.soft(tag).toHaveBeenNthCalledWith(4, 'after-request')
})

it('awaits asynchronous response event listener for the original response', async () => {
  const tag = vi.fn<(tag: string) => void>()

  interceptor.on('response', async ({ response }) => {
    tag('response')
    await response.text()
    tag('after-response')
  })

  tag('before-request')
  const request = http.get(httpServer.http.url('/resource'))
  const [response] = await toWebResponse(request)
  tag('after-request')

  await expect(response.text()).resolves.toBe('original response')

  expect.soft(tag).toHaveBeenNthCalledWith(1, 'before-request')
  expect.soft(tag).toHaveBeenNthCalledWith(2, 'response')
  expect.soft(tag).toHaveBeenNthCalledWith(3, 'after-response')
  expect.soft(tag).toHaveBeenNthCalledWith(4, 'after-request')
})
