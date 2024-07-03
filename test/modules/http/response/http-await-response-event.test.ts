import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'

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
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('hello world'))
  })

  const responseDone = vi.fn()
  interceptor.on('response', async ({ response }) => {
    await sleep(200)
    const text = await response.text()
    responseDone(text)
  })

  const request = http.get('http://localhost/')
  const { text } = await waitForClientRequest(request)

  expect(await text()).toBe('hello world')
  expect(responseDone).toHaveBeenCalledWith('hello world')
})

it('awaits asynchronous response event listener for the original response', async () => {
  const responseDone = vi.fn()
  interceptor.on('response', async ({ response }) => {
    await sleep(200)
    const text = await response.text()
    responseDone(text)
  })

  const request = http.get(httpServer.http.url('/resource'))
  const { text } = await waitForClientRequest(request)

  expect(await text()).toBe('original response')
  expect(responseDone).toHaveBeenCalledWith('original response')
})
